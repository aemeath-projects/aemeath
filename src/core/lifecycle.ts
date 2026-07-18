/**
 * Aemeath 服务字典类型 —— 供 exostrider ServiceRegistry<AemeathServiceMap> 使用。
 */
import type { EventDispatcher } from '@aemeath-projects/exostrider/dispatch'
import type { ClientPool } from '@aemeath-projects/exostrider/pool'
import type { SessionManager } from '@aemeath-projects/exostrider/session'
import type { NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import type { Queue } from 'bullmq'

import type {
  MasterApis,
  GroupBotRegistry,
  AccountRole,
  MessageRouter,
} from '@/core/accounts/index.js'
import type { AemeathPrismaClient, IrisPrismaClient } from '@/core/db/index.js'
import type { ContextApis, OneBotContext } from '@/core/dispatch/index.js'
import type {
  IrisService,
  IrisArchiveService,
  IrisSearchService,
  MediaStorageService,
} from '@/core/iris/index.js'
import type { LLMService } from '@/core/llm/index.js'
import type { MailboxService } from '@/core/mailbox/index.js'
import type { OssBundle } from '@/core/oss/index.js'
import type { RedisStore } from '@/core/redis/index.js'
import type { SettingsService, SettingsPermissionChecker } from '@/core/settings/index.js'
import type { UserQueryService, UserService, AdminService } from '@/core/user/index.js'
import type { SyncCoordinator } from '@/core/user/sync.js'
import type { CheckinService } from '@/services/checkin.js'
import type { DailyCheckinService } from '@/services/daily-checkin.js'
import type { DriftBottleService } from '@/services/drift-bottle.js'
import type { FeedbackService } from '@/services/feedback.js'
import type { JrlpService } from '@/services/jrlp.js'
import type { LikeService } from '@/services/like.js'

export interface AemeathServiceMap {
  // 数据库
  db: AemeathPrismaClient
  iris_db: IrisPrismaClient

  // Redis
  cache: RedisStore
  persistent: RedisStore

  // 框架核心
  dispatcher: EventDispatcher<AnyOneBotEvent, ContextApis>
  queue: Queue

  // 多账号
  account_pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>
  message_router: MessageRouter
  group_bot_registry: GroupBotRegistry
  master_apis: MasterApis

  // Iris 领域
  iris: IrisService
  iris_archive: IrisArchiveService
  iris_search: IrisSearchService
  media_storage: MediaStorageService

  // OSS
  oss: OssBundle

  // Settings 领域
  settings: SettingsService
  settings_checker: SettingsPermissionChecker

  // 会话
  session_manager: SessionManager<OneBotContext>

  // 用户领域
  user_query_service: UserQueryService
  user_service: UserService
  sync_coordinator: SyncCoordinator
  admin_service: AdminService

  // 站内信
  mailbox: MailboxService

  // LLM
  llm_service: LLMService

  // 业务服务
  user_checkin_service: CheckinService
  feedback_service: FeedbackService
  drift_bottle_service: DriftBottleService
  like_service: LikeService
  daily_checkin_service: DailyCheckinService
  jrlp_service: JrlpService

  // 其余业务服务（@Provide 动态注册，暂无独立类型收益的键继续走 unknown 兜底）
  [key: string]: unknown
}
