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
  qq: Type.Number(),
  registeredAt: Type.String({ description: 'ISO datetime string' }),
  registeredGroupId: Type.Union([Type.Number(), Type.Null()]),
})

/** 点赞历史记录响应 Schema。 */
export const LikeHistoryResponseSchema = Type.Object({
  id: Type.Number(),
  qq: Type.Number(),
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

/* TypeScript 接口 */

export interface CreateLikeTaskRequest {
  qq: number
}
