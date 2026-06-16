/**
 * 点赞 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 新增定时点赞任务请求 Schema。 */
export const CreateLikeTaskRequestSchema = Type.Object({
  qq: Type.Number({ description: '被点赞用户 QQ 号', exclusiveMinimum: 0 }),
})

/** 定时点赞任务响应 Schema。 */
export const LikeTaskResponseSchema = Type.Object({
  id: Type.Number(),
  qq: Type.String(),
  registeredAt: Type.String({ description: 'ISO datetime string' }),
  registeredGroupId: Type.Union([Type.String(), Type.Null()]),
})

/** 点赞历史记录响应 Schema。 */
export const LikeHistoryResponseSchema = Type.Object({
  id: Type.Number(),
  qq: Type.String(),
  times: Type.Number(),
  triggeredAt: Type.String({ description: 'ISO datetime string' }),
  source: Type.String({ description: 'manual | scheduled' }),
  success: Type.Boolean(),
})

/** 分页点赞任务响应 Schema。 */
export const PaginatedLikeTasksResponseSchema = Type.Object({
  items: Type.Array(LikeTaskResponseSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  pages: Type.Number(),
})

/** 分页点赞历史响应 Schema。 */
export const PaginatedLikeHistoryResponseSchema = Type.Object({
  items: Type.Array(LikeHistoryResponseSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  pages: Type.Number(),
})

/** 点赞任务列表查询参数 Schema。 */
export const LikeTasksQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ default: 1, minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ default: 20, minimum: 1, maximum: 100 })),
})

/** 点赞历史查询参数 Schema。 */
export const LikeHistoryQuerySchema = Type.Object({
  qq: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  source: Type.Optional(Type.Union([Type.Literal('manual'), Type.Literal('scheduled')])),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  page: Type.Optional(Type.Number({ default: 1, minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ default: 20, minimum: 1, maximum: 100 })),
})

/** 取消点赞任务路径参数 Schema。 */
export const LikeTaskParamsSchema = Type.Object({
  qq: Type.String({ pattern: '^\\d+$' }),
})

/* TypeScript 接口 */

export interface CreateLikeTaskRequest {
  qq: number
}

export interface LikeTasksQuery {
  page?: number
  pageSize?: number
}

export interface LikeHistoryQuery {
  qq?: string
  source?: 'manual' | 'scheduled'
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}
