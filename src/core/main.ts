/**
 * Fastify 应用入口 —— 组装并启动 Aemeath 框架。
 *
 * 开发环境运行: pnpm dev
 * 生产环境运行: node dist/core/main.js
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { EventDispatcher, handlerRegistry } from '@aemeath-projects/exostrider/dispatch'
import { loadEchoConfig, EchoLoader } from '@aemeath-projects/exostrider/echo'
import type { EchoEntry } from '@aemeath-projects/exostrider/echo'
import {
  LifecycleOrchestrator,
  ServiceRegistry,
  serviceEntryRegistry,
} from '@aemeath-projects/exostrider/lifecycle'
import { createLogger, setLogger, getLogger } from '@aemeath-projects/exostrider/logger'
import type { SessionManager } from '@aemeath-projects/exostrider/session'
import type {
  AnyOneBotEvent,
  PrivateMessageEvent,
  GroupMessageEvent,
  MessageSentEvent,
  AnyNoticeEvent,
  FriendRequestEvent,
  GroupRequestEvent,
} from '@aemeath-projects/napcat/types'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify'

import type { AemeathConfig } from '../../aemeath.config.js'
import pkg from '../../package.json' with { type: 'json' }

const logger = getLogger('main')

import { loadConfig } from './config.js'
import { createMainDb, createChatDb } from './db.js'
import { oneBotContextConfig } from './dispatch/adapter.js'
import type { ContextApis } from './dispatch/adapter.js'
import type { OneBotContext } from './dispatch/context.js'
import { FeatureCheckInterceptor } from './dispatch/feature-check-interceptor.js'
import { LoggingInterceptor, SessionInterceptor } from './dispatch/interceptors/index.js'
import type { FeatureChecker } from './dispatch/mapping-types.js'
import type { AemeathServiceMap } from './lifecycle/types.js'
import { metricsRegistry } from './monitoring/index.js'
import { authPlugin, corsPlugin, swaggerPlugin } from './plugins/index.js'
import { createRedis, checkRedisReachable } from './redis/factory.js'
import { RedisStore } from './redis/store.js'
import { createBullMQConnection, getTaskQueue } from './tasks/broker.js'
import { TaskExecutor } from './tasks/executor.js'
import { setTaskDefinitions } from './tasks/scheduler.js'
import type { TaskDefinition } from './tasks/types.js'

import { ok, OkResponse, FailResponse, HealthDataSchema } from '@/core/schemas/index.js'
import type { InfraState } from '@/types/fastify.js'

/**
 * 侧效应导入（Side-effect imports）
 *
 * EchoLoader 仅扫描 aemeath.config.ts 中声明的业务目录（src/handlers、src/services 等），
 * 不扫描 src/core/ 框架内部目录。以下导入的唯一作用是触发各模块中
 * @Service/@Startup 装饰器的执行，将 Bootstrap 类注册到全局注册表，
 * 之后 LifecycleOrchestrator 才能感知并排序启动这些服务。
 *
 * 新增框架级服务时：若其 Bootstrap 类位于 src/core/ 下，须在此处添加对应的侧效应导入。
 */
// 触发 PersonnelService 的 Startup 注册（EchoLoader 不扫描 src/core/，需手动引入）
import '@/core/personnel/index.js'
// 触发 OSS 模块的 Startup 注册
import '@/core/oss/bootstrap.js'
// 触发 MediaStorageService 的 Startup 注册
import '@/core/chat/media.js'
// 触发 BotClientBootstrap 的 Startup 注册
import '@/core/bot-client.js'
// 触发 SessionManagerBootstrap 的 Startup 注册
import '@/core/session/bootstrap.js'

/** TaskEchoEntry —— task 类型的 echo 条目（含 taskDefinition 字段）。 */
interface TaskEchoEntry extends EchoEntry {
  taskDefinition: TaskDefinition
}

/** RouteEchoEntry —— route 类型的 echo 条目（含 plugin 字段）。 */
interface RouteEchoEntry extends EchoEntry {
  plugin: FastifyPluginAsync
}

/* 模块级生命周期编排器（startup 创建，shutdown 复用同一实例） */
let _orchestrator: LifecycleOrchestrator<AemeathServiceMap> | null = null

/* 注册核心领域 API 路由辅助函数 */

/** 注册核心领域 API 路由（LLM、人员管理），这些路由未随 EchoLoader 发现，硬编码注册。 */
async function _registerCoreRoutes(app: FastifyInstance): Promise<void> {
  try {
    const { llmRoutes } = await import('@/core/llm/api.js')
    await app.register(
      async (fastify) => {
        await llmRoutes(fastify)
      },
      { prefix: '/api/llm' },
    )
  } catch (err) {
    app.log.warn({ err }, 'LLM 路由注册失败')
  }

  try {
    const { registerPersonnelRoutes } = await import('@/core/personnel/api.js')
    await registerPersonnelRoutes(app)
  } catch (err) {
    app.log.warn({ err }, '人员管理路由注册失败')
  }
}

/* 启动逻辑 */

async function _startup(
  app: FastifyInstance,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  app.log.info('Aemeath 正在启动...')

  // 1. 初始化 Prisma 客户端
  const mainDb = createMainDb(config.DATABASE_URL, config.DB_POOL_SIZE)
  const chatDb = createChatDb(config.CHAT_DATABASE_URL, config.CHAT_DB_POOL_SIZE)

  // 2. 初始化 Redis 客户端
  const cacheRedis = createRedis(config.CACHE_REDIS_URL, { lazyConnect: false })
  const persistentRedis = createRedis(config.PERSISTENT_REDIS_URL, {
    lazyConnect: false,
  })

  // 3. 创建 RedisStore 封装
  const cacheStore = new RedisStore(cacheRedis, config.CACHE_DEFAULT_TTL)
  const persistentStore = new RedisStore(persistentRedis, 0)

  // 4. EchoLoader 发现并加载 handlers、services、tasks（触发 @Startup/@Shutdown 副作用）
  const baseDir = resolve(import.meta.dirname, '..', '..')
  const echoConfigPath = resolve(baseDir, 'aemeath.config.js')
  const echoConfig = (await loadEchoConfig(echoConfigPath)) as unknown as AemeathConfig
  const loader = new EchoLoader(echoConfig, baseDir)
  await loader.discoverAll()

  // 5. 将 task definitions 传给 scheduler
  const taskEntries = (await loader.discoverByType('task')) as unknown as TaskEchoEntry[]
  setTaskDefinitions(taskEntries.map((e) => e.taskDefinition))

  // 6. 预检所有 Redis 连接可达性（连接不可用时立即抛出，避免后续操作无声挂起）
  await checkRedisReachable(config.CACHE_REDIS_URL, 'Cache Redis')
  await checkRedisReachable(config.PERSISTENT_REDIS_URL, 'Persistent Redis')
  await checkRedisReachable(config.BULLMQ_REDIS_URL, 'BullMQ Redis')

  // 7. 创建 BullMQ 单队列
  const bullConn = createBullMQConnection(config.BULLMQ_REDIS_URL)
  const queue = getTaskQueue(bullConn)
  const queueName = echoConfig.app?.queueName ?? 'aemeath-tasks'

  // 8. 构建服务注册表，注入基础设施服务
  const appLogger = getLogger('lifecycle')
  const registry = new ServiceRegistry<AemeathServiceMap>()
  registry.set('db', mainDb)
  registry.set('chat_db', chatDb)
  registry.set('cache', cacheStore)
  registry.set('persistent', persistentStore)
  registry.set('cache_redis', cacheRedis)
  registry.set('persistent_redis', persistentRedis)
  registry.set('queue', queue)

  // 9. 生命周期编排器：按拓扑顺序启动所有业务模块（@Provide 服务写入 registry）
  _orchestrator = new LifecycleOrchestrator<AemeathServiceMap>(registry, { logger: appLogger })
  await _orchestrator.startup([...serviceEntryRegistry.values()])

  // 10. 实例化所有 handler（注入依赖）
  handlerRegistry.instantiate((key) => {
    try {
      return registry.get(key)
    } catch {
      return undefined
    }
  })

  // 11. 构建 mapping 和 Dispatcher
  const featureCheckInterceptor = new FeatureCheckInterceptor()
  const loggingInterceptor = new LoggingInterceptor()
  const sessionInterceptor = new SessionInterceptor()
  const composite = handlerRegistry.buildMappings()

  const dispatcher = new EventDispatcher<AnyOneBotEvent, ContextApis>({
    mapping: composite,
    // 拦截器实现使用 OneBotContext（Context 子类），类型断言绕过逆变检查
    interceptors: [featureCheckInterceptor, loggingInterceptor, sessionInterceptor],
    contextConfig: oneBotContextConfig,
    logger: appLogger,
  })

  // 12. 注入 Settings 权限检查器到 FeatureCheckInterceptor（延迟绑定）
  const settingsChecker = registry.getOptional('settings_checker') as FeatureChecker | undefined
  if (settingsChecker !== undefined) {
    featureCheckInterceptor.setChecker(settingsChecker)
  }

  // 13. 注入 SessionManager 到会话拦截器（延迟绑定）
  const sessionManager = registry.getOptional('session_manager') as
    | SessionManager<OneBotContext>
    | undefined
  if (sessionManager !== undefined) {
    sessionInterceptor.setSessionManager(sessionManager)
  }

  // 14. 获取 NapCat 服务实例
  const botClient = registry.get('bot_client')
  const apis: ContextApis = {
    msgApi: registry.get('msg_api'),
    friendApi: registry.get('friend_api'),
    groupApi: registry.get('group_api'),
  }

  // 15. 订阅 NapCat 事件，将事件分发给 Dispatcher
  // 错误已由 EventDispatcher 内部捕获并记录，无需 await
  botClient.on('message', (event: PrivateMessageEvent | GroupMessageEvent) => {
    void dispatcher.dispatch(event, apis)
  })
  botClient.on('message_sent', (event: MessageSentEvent) => {
    void dispatcher.dispatch(event, apis)
  })
  // 通知事件
  botClient.on('notice', (event: AnyNoticeEvent) => {
    void dispatcher.dispatch(event, apis)
  })
  // 请求事件
  botClient.on('request', (event: FriendRequestEvent | GroupRequestEvent) => {
    void dispatcher.dispatch(event, apis)
  })

  // 16. 启动 TaskExecutor（监听 job completed 事件）
  const taskExecutor = new TaskExecutor(
    registry.get('msg_api'),
    registry.get('friend_api'),
    registry.get('group_api'),
    registry.get('bot_client'),
    cacheStore,
    bullConn,
    queueName,
    config.TASK_SEND_DELAY_MS,
  )
  taskExecutor.start()

  // 17. 通过 Fastify decorate 暴露服务（路由层访问入口）
  app.decorate('services', registry)
  app.decorate(
    'infra',
    Object.freeze({
      mainDb,
      chatDb,
      cacheRedis,
      persistentRedis,
      cacheStore,
      persistentStore,
      botClient,
      dispatcher,
      taskExecutor,
      queue,
    }) satisfies InfraState,
  )

  app.log.info(`Aemeath 已启动，等待 NapCat 连接 (ws_port=${String(config.NAPCAT_WS_PORT)})`)
}

/* 关闭逻辑 */

async function _shutdown(app: FastifyInstance): Promise<void> {
  app.log.info('Aemeath 正在关闭...')

  const { taskExecutor, mainDb, chatDb, cacheRedis, persistentRedis, queue } = app.infra

  // 停止 TaskExecutor
  await taskExecutor.close()

  // 关闭业务模块（@Shutdown 按启动逆序，复用 startup 时创建的同一编排器实例）
  try {
    await _orchestrator?.shutdown()
  } catch (err) {
    app.log.error({ err }, '业务模块关闭时发生错误')
  }

  // 关闭数据库连接
  await mainDb.$disconnect()
  await chatDb.$disconnect()

  // 关闭 Redis 连接
  cacheRedis.disconnect()
  persistentRedis.disconnect()

  // 关闭 BullMQ 队列
  await queue.close()

  app.log.info('Aemeath 已停止')
}

/* 主启动函数 */

async function bootstrap(): Promise<void> {
  const config = loadConfig()

  // 初始化日志（须在 Fastify 实例创建前就绪）
  const appLogger = createLogger({
    level: config.LOG_LEVEL,
    format: config.LOG_FORMAT,
  })
  setLogger(appLogger)

  // 创建 Fastify 实例（使用 Pino 作为内置日志器）
  // pino.Logger 与 FastifyBaseLogger 运行时兼容但 TypeScript 泛型逆变不一致，用类型断言统一
  const app = Fastify({
    loggerInstance: appLogger,
    disableRequestLogging: false,
  }) as unknown as FastifyInstance

  /* 注册插件 */

  // CORS
  await corsPlugin(app, config.CORS_ORIGINS)

  // Swagger 文档（仅非生产环境）
  if (!config.isProduction) {
    await swaggerPlugin(app)
  }

  // Bearer token 认证
  await authPlugin(app, config.ADMIN_TOKEN)

  /* 注册 API 路由（须在 onReady 之前，Fastify 封闭路由前） */

  // 通过 EchoLoader 发现并注册 src/apis/ 下所有业务路由插件
  {
    const baseDir = resolve(import.meta.dirname, '..', '..')
    const echoConfigPath = resolve(baseDir, 'aemeath.config.js')
    const echoConfig = await loadEchoConfig(echoConfigPath)
    const loader = new EchoLoader(echoConfig, baseDir)
    const routeEntries = await loader.discoverByType('route')
    for (const entry of routeEntries) {
      await app.register((entry as unknown as RouteEchoEntry).plugin)
    }
  }

  // 注册核心领域 API 路由（LLM、人员管理）
  await _registerCoreRoutes(app)

  /* 系统端点 */

  // 健康检查
  app.get(
    '/health',
    { schema: { response: { 200: OkResponse(HealthDataSchema), 503: FailResponse() } } },
    async () => {
      const { botClient } = app.infra
      return ok({
        status: 'healthy',
        version: pkg.version,
        wsConnected: botClient.transport.state === 'connected',
      })
    },
  )

  // Prometheus 指标
  app.get('/metrics', { schema: { hide: true } }, async (_req, reply) => {
    const metrics = await metricsRegistry.metrics()
    void reply.header('content-type', metricsRegistry.contentType)
    return reply.send(metrics)
  })

  /* 前端静态文件（必须放最后，避免覆盖 API 路由） */
  const frontendDist = resolve(config.FRONTEND_DIST_DIR)
  if (existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      // SPA fallback：所有未匹配路由返回 index.html
      wildcard: false,
    })

    // SPA fallback（前端路由）
    app.setNotFoundHandler(async (_req, reply) => {
      const indexPath = resolve(frontendDist, 'index.html')
      if (existsSync(indexPath)) {
        return reply.sendFile('index.html', frontendDist)
      }
      await reply.status(404).send({ error: 'Not Found' })
    })
  }

  /* 生命周期钩子（内联启动/关闭编排） */

  app.addHook('onReady', async () => {
    await _startup(app, config)
  })

  app.addHook('onClose', async () => {
    await _shutdown(app)
  })

  /* 启动监听 */
  await app.listen({ host: config.HOST, port: config.PORT })
}

/* 入口 */

bootstrap().catch((err: unknown) => {
  logger.error(`启动失败: ${String(err)}`)
  process.exit(1)
})
