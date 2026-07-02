/**
 * 用户反馈 API 请求/响应 Schema（TypeBox）。
 *
 * 覆盖反馈列表查询、详情获取、状态更新的
 * Params（路径参数）、Querystring（查询参数）和 Body 校验。
 */

import { Type } from '@sinclair/typebox'

/* 路径参数 */

/** 反馈 ID 路径参数 */
export const FeedbackIdParamSchema = Type.Object({
  feedbackId: Type.String({ minLength: 1, description: '反馈记录 ID（UUID）' }),
})

/* 查询参数（Querystring） */

/** 反馈列表查询参数 —— GET /api/feedbacks */
export const FeedbackListQuerySchema = Type.Object({
  page: Type.Optional(Type.String({ pattern: '^\\d+$', description: '页码（默认 1）' })),
  pageSize: Type.Optional(Type.String({ pattern: '^\\d+$', description: '每页条数（默认 20）' })),
  status: Type.Optional(
    Type.String({ description: '按状态筛选（pending/processing/resolved/rejected）' }),
  ),
  feedbackType: Type.Optional(Type.String({ description: '按反馈类型筛选' })),
  userId: Type.Optional(Type.String({ pattern: '^\\d+$', description: '按提交者 QQ 筛选' })),
  source: Type.Optional(Type.String({ description: '按来源筛选（group/private）' })),
  search: Type.Optional(Type.String({ description: '模糊搜索内容关键词' })),
})

/* 请求体（Body） */

/** 更新反馈状态请求体 —— POST /api/feedbacks/:feedbackId/status */
export const FeedbackUpdateBodySchema = Type.Object({
  status: Type.String({
    minLength: 1,
    description: '新状态（pending/processing/resolved/rejected）',
  }),
  adminReply: Type.Optional(
    Type.Union([Type.String(), Type.Null()], { description: '管理员回复内容' }),
  ),
})

/* 响应数据 Schema */

/** 反馈条目 Schema —— 对应 Feedback 模型 + feedbackToDict 转换。 */
export const FeedbackItemSchema = Type.Object({
  id: Type.String({ description: '反馈记录 UUID' }),
  userId: Type.String({ description: '提交者 QQ' }),
  groupId: Type.Union([Type.String(), Type.Null()], { description: '来源群号' }),
  content: Type.String({ description: '反馈内容' }),
  status: Type.String({ description: '状态（pending/processing/resolved/rejected）' }),
  feedbackType: Type.Union([Type.String(), Type.Null()], { description: '反馈类型' }),
  source: Type.String({ description: '来源（group/private）' }),
  adminReply: Type.Union([Type.String(), Type.Null()], { description: '管理员回复' }),
  createdAt: Type.String({ description: '创建时间（ISO 8601）' }),
  updatedAt: Type.String({ description: '更新时间（ISO 8601）' }),
  processedAt: Type.Union([Type.String(), Type.Null()], { description: '处理时间（ISO 8601）' }),
})

/** 分页反馈列表响应数据 Schema —— GET /api/feedbacks */
export const PaginatedFeedbacksDataSchema = Type.Object({
  items: Type.Array(FeedbackItemSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  pages: Type.Number(),
})

/** 反馈详情响应数据 Schema —— GET /api/feedbacks/:feedbackId */
export const FeedbackDetailDataSchema = FeedbackItemSchema
