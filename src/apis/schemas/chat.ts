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
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$', description: '按群号筛选' })),
  limit: Type.Optional(Type.String({ pattern: '^\\d+$', description: '返回条数（默认 50）' })),
})

/* ──── 请求体（Body） ──── */

/** 触发归档任务请求体 —— POST /api/chat/archives/trigger */
export const ArchiveTriggerBodySchema = Type.Object({
  partitionName: Type.Optional(Type.String({ description: '指定分区名称，不传则自动归档上月' })),
})
