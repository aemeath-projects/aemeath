/**
 * Fastify 应用入口 —— 组装并启动 Aemeath 框架。
 *
 * 开发环境运行: pnpm dev
 * 生产环境运行: node dist/core/main.js
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type {
  PrivateMessageEvent,
  GroupMessageEvent,
  MessageSentEvent,
  AnyNoticeEvent,
  FriendRequestEvent,
  GroupRequestEvent,
} from '@aemeath-projects/napcat/types'
import fastifyStatic from '@fastify/static'
import { createLogger, setLogger, logger, getLogger } from '@logger'
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify'

import pkg from '../../package.json' with { type: 'json' }

import { loadConfig } from './config.js'
import { createMainDb, createChatDb } from './db.js'
import type { ContextApis } from './dispatch/context.js'
import { EventDispatcher } from './dispatch/dispatcher.js'
import { LoggingInterceptor, SessionInterceptor } from './dispatch/interceptors/index.js'
import { CompositeHandlerMapping } from './dispatch/mapping.js'
import type { FeatureChecker } from './dispatch/mapping.js'
import { buildHandlerMethod } from './dispatch/method-builder.js'
import { handlerRegistry } from './dispatch/registry.js'
import type { EchoConfig } from './echo/config.js'
import { loadEchoConfig } from './echo/config.js'
import { EchoLoader } from './echo/loader.js'
import type { RouteEchoEntry, TaskEchoEntry } from './echo/loader.js'
import { LifecycleOrchestrator } from './lifecycle/orchestrator.js'
import { ServiceRegistry } from './lifecycle/service-registry.js'
import type { InfraServiceMap } from './lifecycle/types.js'
import { metricsRegistry } from './monitoring/index.js'
import { authPlugin, corsPlugin, swaggerPlugin } from './plugins/index.js'
import { createRedis, checkRedisReachable } from './redis/factory.js'
import { RedisStore } from './redis/store.js'
import type { SessionManager } from './session/manager.js'
import { createBullMQConnection, getTaskQueue } from './tasks/broker.js'
import { TaskExecutor } from './tasks/executor.js'
import { setTaskDefinitions } from './tasks/scheduler.js'

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

/* 模块级生命周期编排器（startup 创建，shutdown 复用同一实例） */
let _orchestrator: LifecycleOrchestrator | null = null

/* EchoLoader 辅助函数 */

/**
 * 通过 EchoLoader 加载 handler、service、task 类型的 echo，
 * 触发装饰器副作用（@Startup/@Shutdown 注册），
 * 并将 task definitions 传给 scheduler，最后将 handler 注册到 composite mapping。
 */
async function _loadEchoes(composite: CompositeHandlerMapping): Promise<EchoConfig> {
  const echoConfig = await loadEchoConfig()
  const baseDir = resolve(import.meta.dirname, '..', '..')
  const loader = new EchoLoader(echoConfig, baseDir)

  await loader.discoverByType('handler')
  await loader.discoverByType('service')

  const taskEntries = (await loader.discoverByType('task')) as TaskEchoEntry[]
  setTaskDefinitions(taskEntries.map((e) => e.taskDefinition))

  _registerHandlersToMapping(composite)
  return echoConfig
}

/** 遍历 HandlerRegistry，实例化所有组件并将处理器方法注册到 CompositeHandlerMapping。 */
function _registerHandlersToMapping(composite: CompositeHandlerMapping): void {
  const log = getLogger('main')
  for (const data of handlerRegistry.decoratorValues()) {
    const instance = handlerRegistry.getInstance(data.options.name)
    if (!instance) continue

    let handlerCount = 0
    for (const methodMeta of data.methods) {
      composite.register(buildHandlerMethod(data, methodMeta, instance))
      handlerCount++
    }

    log.info(`组件已注册：${data.options.name}，handler 数量：${String(handlerCount)}`)
  }
}

/* 路由注册辅助函数 */

/** 通过 EchoLoader 发现并注册 src/apis/ 下所有业务路由插件。 */
async function _registerEchoRoutes(app: FastifyInstance): Promise<void> {
  const echoConfig = await loadEchoConfig()
  const baseDir = resolve(import.meta.dirname, '..', '..')
  const loader = new EchoLoader(echoConfig, baseDir)
  const routeEntries = await loader.discoverByType('route')
  for (const entry of routeEntries) {
    await app.register((entry as RouteEchoEntry).plugin as FastifyPluginAsync)
  }
}

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

  // 4. 构建复合处理器映射
  const composite = new CompositeHandlerMapping()

  // 5. EchoLoader 发现并加载 handlers、services、tasks（触发 @Startup/@Shutdown 副作用）
  const echoConfig = await _loadEchoes(composite)

  // 6. 构建 Dispatcher
  const sessionInterceptor = new SessionInterceptor()
  const dispatcher = new EventDispatcher(composite, [new LoggingInterceptor(), sessionInterceptor])

  // 7. 预检所有 Redis 连接可达性（连接不可用时立即抛出，避免后续操作无声挂起）
  await checkRedisReachable(config.CACHE_REDIS_URL, 'Cache Redis')
  await checkRedisReachable(config.PERSISTENT_REDIS_URL, 'Persistent Redis')
  await checkRedisReachable(config.BULLMQ_REDIS_URL, 'BullMQ Redis')

  // 8. 创建 BullMQ 单队列
  const bullConn = createBullMQConnection(config.BULLMQ_REDIS_URL)
  const queue = getTaskQueue(bullConn)
  const queueName = echoConfig.app?.queueName ?? 'aemeath-tasks'

  // 9. 生命周期编排器：按拓扑顺序启动所有业务模块
  _orchestrator = new LifecycleOrchestrator()
  const infraServices = {
    db: mainDb,
    chat_db: chatDb,
    cache: cacheStore,
    persistent: persistentStore,
    cache_redis: cacheRedis,
    persistent_redis: persistentRedis,
    dispatcher,
    queue,
  }

  const allServices: InfraServiceMap = await _orchestrator.startup(infraServices)

  // 10. 实例化所有新格式 handler（注入依赖）
  handlerRegistry.instantiateAll(allServices)

  // 11. 注入 Settings 权限检查器到 Dispatcher（延迟绑定）
  const settingsChecker = allServices.settings_checker as FeatureChecker | undefined
  if (settingsChecker) {
    dispatcher.setFeatureChecker(settingsChecker)
  }

  // 12. 注入 SessionManager 到会话拦截器（延迟绑定）
  const sessionManager = allServices.session_manager as SessionManager | undefined
  if (sessionManager) {
    sessionInterceptor.setSessionManager(sessionManager)
  }

  // 13. 订阅 NapCat 事件，将事件分发给 Dispatcher
  const botClient = allServices.bot_client
  const apis: ContextApis = {
    msgApi: allServices.msg_api,
    friendApi: allServices.friend_api,
    groupApi: allServices.group_api,
  }
  // 消息事件
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

  // 14. 构建 ServiceRegistry（API 路由通过 app.state.serviceRegistry 访问业务服务）
  const serviceRegistry = new ServiceRegistry()
  for (const [key, value] of Object.entries(allServices)) {
    serviceRegistry.register(key, value)
  }
  serviceRegistry.freeze()

  // 15. 启动 TaskExecutor（监听 job completed 事件）
  const taskExecutor = new TaskExecutor(
    allServices.msg_api,
    allServices.friend_api,
    allServices.group_api,
    allServices.bot_client,
    cacheStore,
    bullConn,
    queueName,
    config.TASK_SEND_DELAY_MS,
  )
  taskExecutor.start()

  // 16. 通过 Fastify decorate 暴露服务（路由层访问入口）
  app.decorate('services', serviceRegistry)
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

  /* 注册 API 路由 */
  await _registerEchoRoutes(app)
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
  logger.error({ err }, '启动失败')
  process.exit(1)
})
