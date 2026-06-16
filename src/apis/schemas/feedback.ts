/**
 * 用户反馈 API 请求/响应 Schema（TypeBox）。
 *
 * 覆盖反馈列表查询、详情获取、状态更新的
 * Params（路径参数）、Querystring（查询参数）和 Body 校验。
 */

import { Type } from '@sinclair/typebox'

/* ──── 路径参数 ──── */

/** 反馈 ID 路径参数 */
export const FeedbackIdParamSchema = Type.Object({
  feedbackId: Type.String({ minLength: 1, description: '反馈记录 ID（UUID）' }),
})

/* ──── 查询参数（Querystring） ──── */

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

/* ──── 请求体（Body） ──── */

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
