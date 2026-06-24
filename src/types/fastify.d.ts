/**
 * Fastify 类型扩展 —— 通过 decorate 注入的服务和基础设施访问。
 */
import type { EventDispatcher } from '@aemeath-projects/exostrider/dispatch'
import type { ServiceRegistry } from '@aemeath-projects/exostrider/lifecycle'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import type { Redis } from 'ioredis'

import type { createMainDb, createIrisDb } from '@/core/db/index.js'
import type { ContextApis } from '@/core/dispatch/index.js'
import type { AemeathServiceMap } from '@/core/lifecycle.js'
import type { RedisStore } from '@/core/redis/index.js'
import type { TaskExecutor } from '@/core/tasks/index.js'

/** 基础设施依赖（由 _startup 闭包产出，通过 decorate 暴露给路由层）。 */
export interface InfraState {
  readonly mainDb: ReturnType<typeof createMainDb>
  readonly irisDb: ReturnType<typeof createIrisDb>
  readonly cacheRedis: Redis
  readonly persistentRedis: Redis
  readonly cacheStore: RedisStore
  readonly persistentStore: RedisStore
  readonly dispatcher: EventDispatcher<AnyOneBotEvent, ContextApis>
  readonly taskExecutor: TaskExecutor | null
  readonly queue: { close(): Promise<void> }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** 业务服务注册表（只读，由 LifecycleOrchestrator 产出）。 */
    services: ServiceRegistry<AemeathServiceMap>
    /** 基础设施依赖（只读，由 _startup 闭包产出）。 */
    infra: InfraState
  }
}
