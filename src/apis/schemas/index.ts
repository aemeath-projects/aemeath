/** API 请求/响应 Schema 统一导出。 */

export {
  BotProfileUpdateRequestSchema,
  BotInfoDataSchema,
  BotProfileDataSchema,
  BotProfileUpdateDataSchema,
  type BotProfileUpdateRequest,
} from './bot.js'

export {
  CheckinRecordResponseSchema,
  PaginatedCheckinsResponseSchema,
  LeaderEntryResponseSchema,
  LeaderboardDataSchema,
  DayCountResponseSchema,
  TrendDataSchema,
  SummaryResponseSchema,
  CheckinRecordsQuerySchema,
  CheckinLeaderboardQuerySchema,
  CheckinTrendQuerySchema,
  CheckinSummaryQuerySchema,
  type CheckinRecordsQuery,
  type CheckinLeaderboardQuery,
  type CheckinTrendQuery,
  type CheckinSummaryQuery,
} from './checkin.js'

export { PaginationSchema, OkResponse, FailResponse } from '@/core/schemas/index.js'

export {
  CreatePoolRequestSchema,
  GroupAssignRequestSchema,
  PoolInfoResponseSchema,
  PoolListDataSchema,
  PoolGroupsResponseSchema,
  PoolIdParamSchema,
  type CreatePoolRequest,
  type GroupAssignRequest,
} from './drift-bottle.js'

export {
  WifeRecordResponseSchema,
  PaginatedRecordsResponseSchema,
  SetWifeRequestSchema,
  UpdateRecordRequestSchema,
  DeleteRecordRequestSchema,
  JrlpRecordsQuerySchema,
  type SetWifeRequest,
  type UpdateRecordRequest,
  type DeleteRecordRequest,
  type JrlpRecordsQuery,
} from './jrlp.js'

export {
  CreateLikeTaskRequestSchema,
  LikeTaskResponseSchema,
  LikeHistoryResponseSchema,
  PaginatedLikeTasksResponseSchema,
  PaginatedLikeHistoryResponseSchema,
  LikeTasksQuerySchema,
  LikeHistoryQuerySchema,
  LikeTaskParamsSchema,
  type CreateLikeTaskRequest,
  type LikeTasksQuery,
  type LikeHistoryQuery,
} from './like.js'

export {
  SetValueRequestSchema,
  BatchSetRequestSchema,
  SettingsGroupIdParamSchema,
  SettingsUserIdParamSchema,
  SettingsKeyParamSchema,
  SettingsGroupKeyParamsSchema,
  SettingsUserKeyParamsSchema,
  SettingsQuerySchema,
  SettingsSchemaListDataSchema,
  SettingsRecordDataSchema,
  type SetValueRequest,
  type BatchSetRequest,
} from './permission.js'

export {
  GroupIdParamSchema,
  UserIdParamSchema,
  MessageIdParamSchema,
  GroupMessageQuerySchema,
  PrivateMessageQuerySchema,
  MessageContextQuerySchema,
  ArchiveListQuerySchema,
  ArchiveQuerySchema,
  ArchiveTriggerBodySchema,
  MessageListDataSchema,
  MessageContextDataSchema,
  PaginatedArchivesDataSchema,
  ArchiveQueryDataSchema,
  ArchiveTriggerDataSchema,
} from './chat.js'

export {
  FeedbackIdParamSchema,
  FeedbackListQuerySchema,
  FeedbackUpdateBodySchema,
  PaginatedFeedbacksDataSchema,
  FeedbackDetailDataSchema,
} from './feedback.js'

export {
  QueueStreamQuerySchema,
  QueueLengthDataSchema,
  ScheduledTasksDataSchema,
  ActiveTasksDataSchema,
  ReservedTasksDataSchema,
  WorkersDataSchema,
  PendingTasksDataSchema,
} from './queue.js'

export { HandlerListDataSchema } from './handlers.js'

export { LogStreamQuerySchema } from './logs.js'

export {
  IrisSearchQuerySchema,
  IrisTriggerArchiveBodySchema,
  IrisSearchDataSchema,
  IrisStatsDataSchema,
  IrisTriggerDataSchema,
} from './iris.js'
