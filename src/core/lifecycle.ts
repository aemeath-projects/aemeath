/**
 * Aemeath 服务字典类型 —— 供 exostrider ServiceRegistry<AemeathServiceMap> 使用。
 */
import type { EventDispatcher } from '@aemeath-projects/exostrider/dispatch'
import type { ClientPool } from '@aemeath-projects/exostrider/pool'
import type { NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

import type {
  MasterApis,
  GroupBotRegistry,
  AccountRole,
  MessageRouter,
} from '@/core/accounts/index.js'
import type { MainPrismaClient, IrisPrismaClient } from '@/core/db/index.js'
import type { ContextApis } from '@/core/dispatch/index.js'
import type { IrisSearchService } from '@/core/iris/index.js'
import type { RedisStore } from '@/core/redis/index.js'

export interface AemeathServiceMap {
  // ── 数据库 ──
  db: MainPrismaClient
  iris_db: IrisPrismaClient

  // ── Redis ──
  cache: RedisStore
  persistent: RedisStore
  cache_redis: Redis
  persistent_redis: Redis

  // ── 框架核心 ──
  dispatcher: EventDispatcher<AnyOneBotEvent, ContextApis>
  queue: Queue

  // ── 多账号 ──
  account_pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>
  message_router: MessageRouter
  group_bot_registry: GroupBotRegistry
  master_apis: MasterApis

  // ── Iris 领域 ──
  iris_search: IrisSearchService

  // ── 业务服务（@Provide 动态注册） ──
  [key: string]: unknown
}
