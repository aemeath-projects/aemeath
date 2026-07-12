/**
 * Iris 搜索与统计 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/* 查询参数（Querystring） */

/** 归档消息搜索查询参数 —— GET /api/iris/archives/search */
export const IrisSearchQuerySchema = Type.Object({
  keyword: Type.Optional(Type.String({ description: '搜索关键词' })),
  groupId: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '群号（BigInt as string）' }),
  ),
  userId: Type.Optional(Type.String({ pattern: '^\\d+$', description: '用户 QQ' })),
  startDate: Type.Optional(Type.String({ description: '起始时间（ISO 8601）' })),
  endDate: Type.Optional(Type.String({ description: '截止时间（ISO 8601）' })),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 100, default: 50, description: '返回条数' }),
  ),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0, description: '跳过条数' })),
})

/** 消息实时推送 SSE 流查询参数 —— GET /api/iris/messages/stream */
export const IrisMessageStreamQuerySchema = Type.Object({
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$', description: '群号，与 userId 二选一' })),
  userId: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '用户 QQ，与 groupId 二选一' }),
  ),
})

/* 请求体（Body） */

/** 手动触发归档任务请求体 —— POST /api/iris/archives/trigger */
export const IrisTriggerArchiveBodySchema = Type.Object({
  groupId: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '群 ID（BigInt 字符串），不传则全量归档' }),
  ),
  reason: Type.Optional(Type.String({ description: '手动触发原因（仅日志记录）' })),
})

/* 响应数据 Schema */

/** 归档消息搜索结果数据 Schema —— GET /api/iris/archives/search */
export const IrisSearchDataSchema = Type.Object({
  items: Type.Array(
    Type.Object({
      id: Type.String({ description: '消息索引 UUID' }),
      messageId: Type.Number({ description: '消息 ID' }),
      groupId: Type.Union([Type.String(), Type.Null()], { description: '群号' }),
      userId: Type.String({ description: '用户 QQ' }),
      textSnippet: Type.String({ description: '文本摘要' }),
      archivedAt: Type.String({ description: '归档时间（ISO 8601）' }),
      createdAt: Type.String({ description: '消息创建时间（ISO 8601）' }),
    }),
  ),
  total: Type.Number({ description: '符合条件的总条数' }),
  limit: Type.Number({ description: '本次返回最大条数' }),
  offset: Type.Number({ description: '本次跳过条数' }),
})

/** Iris 统计数据 Schema —— GET /api/iris/stats */
export const IrisStatsDataSchema = Type.Object({
  totalMessages: Type.Number({ description: '聊天记录总行数' }),
  completedArchives: Type.Number({ description: '已完成的归档记录数' }),
})

/** 手动触发归档响应数据 Schema —— POST /api/iris/archives/trigger */
export const IrisTriggerDataSchema = Type.Object({
  taskId: Type.String({ description: 'BullMQ job ID' }),
})
