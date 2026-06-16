/**
 * 生命周期 DI 容器类型定义。
 *
 * 为 Infrastructure 和 NapCat SDK 的已知 key 提供编译期类型检查，
 * 同时保留 string 索引签名以兼容 EchoLoader 动态注册的业务服务。
 */

import type {
  NapCatClient,
  MessageApi,
  GroupApi,
  FriendApi,
  FileApi,
  SystemApi,
  ExtensionApi,
} from '@aemeath-projects/napcat'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

import type { MainPrismaClient, ChatPrismaClient } from '@/core/db.js'
import type { EventDispatcher } from '@/core/dispatch/dispatcher.js'
import type { RedisStore } from '@/core/redis/store.js'

/**
 * 生命周期编排器中的服务字典类型。
 *
 * 包含 15 个基础设施 key（DB、Redis、NapCat SDK、BullMQ、EventDispatcher）
 * 和通过 @Provide 动态注册的业务服务 key（如 oss、settings、renderer 等）。
 *
 * string 索引签名确保对未枚举的业务 key 也能通过方括号访问，
 * 但访问结果类型为 unknown，使用者需自行断言。
 */
export interface InfraServiceMap {
  // ── 数据库 ──
  db: MainPrismaClient
  chat_db: ChatPrismaClient

  // ── Redis ──
  cache: RedisStore
  persistent: RedisStore
  cache_redis: Redis
  persistent_redis: Redis

  // ── 框架核心 ──
  dispatcher: EventDispatcher
  queue: Queue

  // ── NapCat SDK（BotClientBootstrap @Provide 注册） ──
  bot_client: NapCatClient
  msg_api: MessageApi
  group_api: GroupApi
  friend_api: FriendApi
  file_api: FileApi
  system_api: SystemApi
  extension_api: ExtensionApi

  // ── 业务服务（EchoLoader @Provide 动态注册） ──
  [key: string]: unknown
}
