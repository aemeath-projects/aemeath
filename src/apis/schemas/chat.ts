/**
 * 聊天记录 API 请求/响应 Schema（TypeBox）。
 *
 * 覆盖群聊消息查询、私聊消息查询、归档管理路由的
 * Params（路径参数）、Querystring（查询参数）和 Body 校验。
 */

import { Type } from '@sinclair/typebox'

/* ──── 路径参数 ──── */

/** 群 ID 路径参数 */
export const GroupIdParamSchema = Type.Object({
  groupId: Type.String({ pattern: '^\\d+$', description: '群号 / 群 ID' }),
})

/** 用户 ID 路径参数 */
export const UserIdParamSchema = Type.Object({
  userId: Type.String({ pattern: '^\\d+$', description: 'QQ 号 / 用户 ID' }),
})

/** 消息 ID 路径参数 */
export const MessageIdParamSchema = Type.Object({
  messageId: Type.String({ pattern: '^\\d+$', description: '消息 ID' }),
})

/* ──── 查询参数（Querystring） ──── */

/** 群聊消息列表查询参数 —— GET /api/chat/messages/group/:groupId */
export const GroupMessageQuerySchema = Type.Object({
  before: Type.Optional(Type.String({ description: '游标时间（ISO 8601）' })),
  limit: Type.Optional(Type.String({ pattern: '^\\d+$', description: '每页条数（默认 50）' })),
  keyword: Type.Optional(Type.String({ description: '模糊搜索关键词' })),
  userId: Type.Optional(Type.String({ pattern: '^\\d+$', description: '按发送者 QQ 筛选' })),
  startDate: Type.Optional(Type.String({ description: '起始日期（ISO 8601）' })),
  endDate: Type.Optional(Type.String({ description: '截止日期（ISO 8601）' })),
})

/** 私聊消息列表查询参数 —— GET /api/chat/messages/private/:userId */
export const PrivateMessageQuerySchema = Type.Object({
  before: Type.Optional(Type.String({ description: '游标时间（ISO 8601）' })),
  limit: Type.Optional(Type.String({ pattern: '^\\d+$', description: '每页条数（默认 50）' })),
})

/** 消息上下文查询参数 —— GET /api/chat/messages/:messageId/context */
export const MessageContextQuerySchema = Type.Object({
  createdAt: Type.String({ description: '锚点消息的创建时间（ISO 8601，必填）' }),
  context: Type.Optional(Type.String({ pattern: '^\\d+$', description: '上下文条数（默认 5）' })),
})

/** 归档列表查询参数 —— GET /api/chat/archives */
export const ArchiveListQuerySchema = Type.Object({
  page: Type.Optional(Type.String({ pattern: '^\\d+$', description: '页码（默认 1）' })),
  pageSize: Type.Optional(Type.String({ pattern: '^\\d+$', description: '每页条数（默认 20）' })),
})

/** 归档查询参数 —— GET /api/chat/archives/query */
export const ArchiveQuerySchema = Type.Object({
  periodStart: Type.String({ description: '起始月份（ISO 8601，必填）' }),
  // TODO: groupId 参数已由 schema 定义但 handler 中未传递给 listArchives，待服务支持后接入
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$', description: '按群号筛选' })),
  limit: Type.Optional(Type.String({ pattern: '^\\d+$', description: '返回条数（默认 50）' })),
})

/* ──── 请求体（Body） ──── */

/** 触发归档任务请求体 —— POST /api/chat/archives/trigger */
export const ArchiveTriggerBodySchema = Type.Object({
  partitionName: Type.Optional(Type.String({ description: '指定分区名称，不传则自动归档上月' })),
})

/* ──── 响应数据 Schema ──── */

/** 聊天消息 Schema —— 对应 ChatMessage 模型。 */
export const ChatMessageSchema = Type.Object({
  id: Type.Number({ description: '自增 ID' }),
  createdAt: Type.String({ description: '消息创建时间（ISO 8601）' }),
  messageId: Type.Number({ description: '消息 ID' }),
  messageType: Type.Number({ description: '消息类型（1=私聊 2=群聊 3=自发送）' }),
  groupId: Type.Union([Type.Number(), Type.Null()], { description: '群号（私聊时为 null）' }),
  userId: Type.Number({ description: '发送者 QQ' }),
  rawMessage: Type.String({ description: '原始消息文本' }),
  segments: Type.Unknown({ description: '消息段 JSON' }),
  senderNickname: Type.String({ description: '发送者昵称' }),
  senderCard: Type.Union([Type.String(), Type.Null()], { description: '群名片' }),
  senderRole: Type.Union([Type.String(), Type.Null()], { description: '群角色' }),
  storedAt: Type.String({ description: '入库时间（ISO 8601）' }),
})

/** 群聊/私聊消息列表响应数据 Schema —— GET /api/chat/messages/group/:groupId, /messages/private/:userId */
export const MessageListDataSchema = Type.Array(ChatMessageSchema)

/** 消息上下文响应数据 Schema —— GET /api/chat/messages/:messageId/context */
export const MessageContextDataSchema = Type.Object({
  before: Type.Array(ChatMessageSchema, { description: '锚点之前的消息' }),
  current: Type.Array(ChatMessageSchema, { description: '锚点消息' }),
  after: Type.Array(ChatMessageSchema, { description: '锚点之后的消息' }),
})

/** 归档日志 Schema —— 对应 ChatArchiveLog 模型。 */
export const ArchiveLogSchema = Type.Object({
  id: Type.String({ description: '归档记录 UUID' }),
  partitionName: Type.String({ description: '分区名称' }),
  periodStart: Type.String({ description: '起始日期（ISO 8601）' }),
  periodEnd: Type.String({ description: '截止日期（ISO 8601）' }),
  totalRows: Type.Number({ description: '归档行数' }),
  originalBytes: Type.Number({ description: '原始字节数' }),
  compressedBytes: Type.Number({ description: '压缩后字节数' }),
  s3Bucket: Type.String({ description: 'S3 存储桶' }),
  s3Key: Type.String({ description: 'S3 对象 key' }),
  s3Sha256: Type.String({ description: 'S3 对象 SHA-256' }),
  status: Type.String({ description: '状态（pending/running/completed/failed）' }),
  errorMessage: Type.Union([Type.String(), Type.Null()], { description: '错误信息' }),
  createdAt: Type.String({ description: '创建时间（ISO 8601）' }),
  completedAt: Type.Union([Type.String(), Type.Null()], { description: '完成时间（ISO 8601）' }),
})

/** 分页归档日志响应数据 Schema —— GET /api/chat/archives */
export const PaginatedArchivesDataSchema = Type.Object({
  items: Type.Array(ArchiveLogSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  pages: Type.Number(),
})

/** 归档查询响应数据 Schema —— GET /api/chat/archives/query */
export const ArchiveQueryDataSchema = Type.Array(ArchiveLogSchema)

/** 触发归档任务响应数据 Schema —— POST /api/chat/archives/trigger */
export const ArchiveTriggerDataSchema = Type.Object({
  taskId: Type.String({ description: 'BullMQ job ID' }),
})
