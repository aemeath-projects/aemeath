/**
 * Aemeath 服务字典类型 —— 供 exostrider ServiceRegistry<AemeathServiceMap> 使用。
 */
import type { EventDispatcher } from '@aemeath-projects/exostrider/dispatch'
import type {
  NapCatClient,
  MessageApi,
  GroupApi,
  FriendApi,
  FileApi,
  SystemApi,
  ExtensionApi,
} from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

import type { MainPrismaClient, ChatPrismaClient } from '@/core/db.js'
import type { ContextApis } from '@/core/dispatch/adapter.js'
import type { RedisStore } from '@/core/redis/store.js'

export interface AemeathServiceMap {
  // ── 数据库 ──
  db: MainPrismaClient
  chat_db: ChatPrismaClient

  // ── Redis ──
  cache: RedisStore
  persistent: RedisStore
  cache_redis: Redis
  persistent_redis: Redis

  // ── 框架核心 ──
  dispatcher: EventDispatcher<AnyOneBotEvent, ContextApis>
  queue: Queue

  // ── NapCat SDK ──
  bot_client: NapCatClient
  msg_api: MessageApi
  group_api: GroupApi
  friend_api: FriendApi
  file_api: FileApi
  system_api: SystemApi
  extension_api: ExtensionApi

  // ── 业务服务（@Provide 动态注册） ──
  [key: string]: unknown
}
