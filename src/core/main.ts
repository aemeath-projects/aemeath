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
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyPluginAsync, LogController } from 'fastify'

import type { AemeathConfig } from '../../aemeath.config.js'
import pkg from '../../package.json' with { type: 'json' }

const logger = getLogger('main')

import { loadConfig } from './config.js'
import { createAemeathDb, createIrisDb } from './db/index.js'
import { oneBotContextConfig, OneBotContext } from './dispatch/index.js'
import type { ContextApis, FeatureChecker } from './dispatch/index.js'
import {
  CapabilityInterceptor,
  FeatureCheckInterceptor,
  IrisInterceptor,
  LoggingInterceptor,
  SessionInterceptor,
} from './dispatch/interceptors/index.js'
import { AppError } from './errors.js'
import type { IrisService } from './iris/index.js'
import type { AemeathServiceMap } from './lifecycle.js'
import { metricsRegistry } from './monitoring/index.js'
import { corsPlugin, swaggerPlugin } from './plugins/index.js'
import { createRedis, checkRedisReachable, RedisStore } from './redis/index.js'
import {
  createBullMQConnection,
  getTaskQueue,
  TaskExecutor,
  setTaskDefinitions,
} from './tasks/index.js'
import type { TaskDefinition } from './tasks/index.js'

import { buildContextApis } from '@/core/accounts/index.js'
import type { PriorityMode } from '@/core/accounts/index.js'
import { ok, OkResponse, FailResponse, HealthDataSchema } from '@/core/schemas/index.js'
import { Path } from '@/core/settings/index.js'
import type { SettingsService } from '@/core/settings/index.js'
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
// 触发 UserService 的 Startup 注册（EchoLoader 不扫描 src/core/，需手动引入）
import '@/core/user/index.js'
// 触发 AdminBootstrap 的 Startup 注册
import '@/core/user/admin.js'
// 触发 OSS 模块的 Startup 注册
import '@/core/oss/bootstrap.js'
// 触发 MediaStorageService 的 Startup 注册
import '@/core/iris/media.js'
// 触发 IrisBootstrap 的 Startup 注册（IrisService / IrisArchiveService / IrisSearchService）
import '@/core/iris/bootstrap.js'
// 触发 BotClientBootstrap 的 Startup 注册
import '@/core/accounts/bootstrap.js'
// 触发 SessionManagerBootstrap 的 Startup 注册
import '@/core/session/bootstrap.js'
// 触发 MailboxBootstrap 的 Startup 注册
import '@/core/mailbox/bootstrap.js'

/** TaskEchoEntry —— task 类型的 echo 条目，module 为包含 taskDefinition 命名导出的模块命名空间。 */
interface TaskEchoEntry extends EchoEntry {
  module: { taskDefinition: TaskDefinition }
}

/** RouteEchoEntry —— route 类型的 echo 条目，module 为以 default 导出 FastifyPluginAsync 的模块命名空间。 */
interface RouteEchoEntry extends EchoEntry {
  module: { default: FastifyPluginAsync }
}

/* 模块级生命周期编排器（startup 创建，shutdown 复用同一实例） */
let _orchestrator: LifecycleOrchestrator<AemeathServiceMap> | null = null
/* 标记生命周期启动失败——LifecycleOrchestrator 已记录详细错误，bootstrap catch 无需重复打印 */
let _startupFailed = false

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
    const { registerUserRoutes } = await import('@/core/user/api.js')
    await registerUserRoutes(app)
  } catch (err) {
    app.log.warn({ err }, '用户管理路由注册失败')
  }

  try {
    const { mailboxRoutes } = await import('@/core/mailbox/api.js')
    await app.register(
      async (fastify) => {
        await mailboxRoutes(fastify)
      },
      { prefix: '/api/mailbox' },
    )
  } catch (err) {
    app.log.warn({ err }, '站内信路由注册失败')
  }
}

/* 启动逻辑 */

async function _startup(
  app: FastifyInstance,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  app.log.info('Aemeath 正在启动...')

  // 1. 初始化 Prisma 客户端
  const aemeathDb = createAemeathDb(config.DATABASE_URL, config.DB_POOL_SIZE)
  const irisDb = createIrisDb(config.IRIS_DATABASE_URL, config.IRIS_DB_POOL_SIZE)

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
  setTaskDefinitions(taskEntries.map((e) => e.module.taskDefinition))

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
  registry.set('db', aemeathDb)
  registry.set('iris_db', irisDb)
  registry.set('cache', cacheStore)
  registry.set('persistent', persistentStore)
  registry.set('cache_redis', cacheRedis)
  registry.set('persistent_redis', persistentRedis)
  registry.set('queue', queue)

  // 9. 生命周期编排器：按拓扑顺序启动所有业务模块（@Provide 服务写入 registry）
  _orchestrator = new LifecycleOrchestrator<AemeathServiceMap>(registry, { logger: appLogger })
  try {
    await _orchestrator.startup([...serviceEntryRegistry.values()])
  } catch (err) {
    // LifecycleOrchestrator 已将错误记录至 lifecycle 模块，标记以避免 bootstrap catch 重复打印
    _startupFailed = true
    throw err
  }

  // 10. 实例化所有 handler（注入依赖）
  // 依赖缺失时必须记录明确错误，禁止静默吞错——否则会在业务代码里表现为
  // 难以定位的 "Cannot read properties of undefined" 深层 TypeError
  handlerRegistry.instantiate((key) => {
    if (!registry.has(key)) {
      appLogger.error(`Handler 依赖注入失败：服务 "${key}" 未在注册表中找到`)
      return undefined
    }
    return registry.get(key)
  })

  // 11. 构建 mapping 和 Dispatcher
  // 提前获取 pool（供 CapabilityInterceptor 使用）
  const pool = registry.get('account_pool')
  const groupBotRegistry = registry.get('group_bot_registry')
  const capabilityInterceptor = new CapabilityInterceptor(groupBotRegistry, pool)

  const featureCheckInterceptor = new FeatureCheckInterceptor()
  const loggingInterceptor = new LoggingInterceptor()
  const sessionInterceptor = new SessionInterceptor()

  const irisInterceptor = new IrisInterceptor(registry.get('iris') as IrisService)

  const composite = handlerRegistry.buildMappings()

  const dispatcher = new EventDispatcher<AnyOneBotEvent, ContextApis>({
    mapping: composite,
    // 拦截器实现使用 OneBotContext（Context 子类），类型断言绕过逆变检查
    interceptors: [
      featureCheckInterceptor,
      loggingInterceptor,
      capabilityInterceptor, // logging 之后，session 之前
      sessionInterceptor,
    ],
    // dispatch 级拦截器：每次 dispatch() 恰好执行一次，与是否命中业务 handler、
    // 命中几个 handler 完全无关（区别于上面 interceptors 的"每个匹配 handler 各执行
    // 一次"语义）。IrisInterceptor 需要对所有消息无条件归档，必须用这个通道注册，
    // 否则普通聊天消息（未命中任何业务 handler）永远不会被归档，详见 iris.ts 顶部注释。
    dispatchInterceptors: [irisInterceptor],
    contextConfig: oneBotContextConfig,
    // EventDispatcher 内部默认构造 exostrider 内置的 Context 基类，OneBotContext
    // 追加的 groupId/userId/reply() 等成员不会生效（详见 exostrider
    // EventDispatcherOptions.contextFactory 的说明）。必须显式传入这个工厂，
    // dispatch() 才会实际构造 OneBotContext 实例。
    contextFactory: (event, apis, config) => new OneBotContext(event, apis, config),
    logger: appLogger,
  })

  // 12. 注入 Settings 权限检查器到 FeatureCheckInterceptor（延迟绑定）
  const settingsChecker = registry.getOptional('settings_checker') as FeatureChecker | undefined
  if (settingsChecker !== undefined) {
    featureCheckInterceptor.setChecker(settingsChecker)
  }

  // 13. 注入 SessionManager 到会话拦截器（延迟绑定）
  const sessionManager = registry.getOptional('session_manager') as
    SessionManager<OneBotContext> | undefined
  if (sessionManager !== undefined) {
    sessionInterceptor.setSessionManager(sessionManager)
  }

  // 14. 从 registry 获取多账号服务实例，接入事件管道
  const router = registry.get('message_router')

  // 14.5 同步持久化的多账号路由优先级模式（延迟绑定，避免 MultiAccountBootstrap 与
  // SettingsBootstrap 之间产生启动期循环依赖，详见 accounts/bootstrap.ts 顶部说明）
  const settingsForRouting = registry.getOptional('settings') as SettingsService | undefined
  if (settingsForRouting !== undefined) {
    const persistedMode = await settingsForRouting.get<PriorityMode>(
      'accounts.priority_mode',
      Path.system(),
    )
    router.setPriorityMode(persistedMode)
  }

  pool.on('event', (aggregated) => {
    void dispatcher.dispatch(aggregated.event, buildContextApis(aggregated, router, pool))
  })

  // 15. 启动 TaskExecutor（监听 job completed 事件）—— master_apis 现在始终是"活体
  // 代理"（见 accounts/bootstrap.ts 的 createLiveMasterApi），即使启动时暂无主账号，
  // 之后通过 /api/accounts 补建也无需重启即可生效，不再需要"无主账号不启动"的分支。
  // MasterApis 的类型仍然声明为可空（兼容其他消费方独立的防御性兜底），此处用守卫
  // 收窄类型，正常情况下不会真正命中。
  const masterApis = registry.get('master_apis')
  if (!masterApis.msgApi || !masterApis.friendApi || !masterApis.groupApi) {
    throw new AppError(-1, 'master_apis 未正确初始化，TaskExecutor 无法启动', 500)
  }
  const taskExecutor = new TaskExecutor(
    masterApis.msgApi,
    masterApis.friendApi,
    masterApis.groupApi,
    pool,
    cacheStore,
    router,
    bullConn,
    queueName,
    config.TASK_SEND_DELAY_MS,
  )
  taskExecutor.start()

  // 16. 通过 Fastify decorate 暴露服务（路由层访问入口）
  app.decorate('services', registry)
  app.decorate(
    'infra',
    Object.freeze({
      aemeathDb,
      irisDb,
      cacheRedis,
      persistentRedis,
      cacheStore,
      persistentStore,
      dispatcher,
      taskExecutor,
      queue,
    }) satisfies InfraState,
  )

  app.log.info('Aemeath 已启动，多账号连接池初始化中...')
}

/* 关闭逻辑 */

async function _shutdown(app: FastifyInstance): Promise<void> {
  app.log.info('Aemeath 正在关闭...')

  const { taskExecutor, aemeathDb, irisDb, cacheRedis, persistentRedis, queue } = app.infra

  // 停止 TaskExecutor（无主账号时为 null）
  await taskExecutor?.close()

  // 关闭业务模块（@Shutdown 按启动逆序，复用 startup 时创建的同一编排器实例）
  try {
    await _orchestrator?.shutdown()
  } catch (err) {
    app.log.error({ err }, '业务模块关闭时发生错误')
  }

  // 关闭数据库连接
  await aemeathDb.$disconnect()
  await irisDb.$disconnect()

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
    logController: new LogController({
      disableRequestLogging: false,
    }),
  }) as unknown as FastifyInstance

  /* 注册插件 */

  // CORS
  await corsPlugin(app, config.CORS_ORIGINS)

  // Swagger 文档（仅非生产环境）
  if (!config.isProduction) {
    await swaggerPlugin(app)
  }

  /* 注册 API 路由（须在 onReady 之前，Fastify 封闭路由前） */

  // 通过 EchoLoader 发现并注册 src/apis/ 下所有业务路由插件
  {
    const baseDir = resolve(import.meta.dirname, '..', '..')
    const echoConfigPath = resolve(baseDir, 'aemeath.config.js')
    const echoConfig = await loadEchoConfig(echoConfigPath)
    const loader = new EchoLoader(echoConfig, baseDir)
    const routeEntries = await loader.discoverByType('route')
    for (const entry of routeEntries) {
      await app.register((entry as unknown as RouteEchoEntry).module.default)
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
      const pool = app.services.getOptional('account_pool')
      return ok({
        status: 'healthy',
        version: pkg.version,
        wsConnected: (pool?.getAvailableClients().length ?? 0) > 0,
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
  // _startupFailed 为 true 时，LifecycleOrchestrator 已记录详细错误，此处仅退出
  if (!_startupFailed) {
    logger.error(`启动失败: ${String(err)}`)
  }
  process.exit(1)
})
