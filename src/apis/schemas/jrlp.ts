/**
 * 今日老婆 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 单条记录响应 Schema。 */
export const WifeRecordResponseSchema = Type.Object({
  id: Type.Number(),
  groupId: Type.String(),
  userId: Type.String(),
  wifeQq: Type.String(),
  date: Type.String({ description: 'ISO date string' }),
  drawnAt: Type.Union([Type.String(), Type.Null()]),
})

/** 分页记录响应 Schema。 */
export const PaginatedRecordsResponseSchema = Type.Object({
  items: Type.Array(WifeRecordResponseSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  pages: Type.Number(),
})

/** 手动设置老婆请求 Schema。 */
export const SetWifeRequestSchema = Type.Object({
  groupId: Type.Number({ description: '群号' }),
  userId: Type.Number({ description: '抽取者 QQ' }),
  wifeQq: Type.Number({ description: '老婆 QQ' }),
  date: Type.String({ description: '日期（YYYY-MM-DD）' }),
})

/** 修改记录请求 Schema。 */
export const UpdateRecordRequestSchema = Type.Object({
  id: Type.Number({ description: '记录 ID' }),
  wifeQq: Type.Number({ description: '新老婆 QQ' }),
})

/** 删除记录请求 Schema。 */
export const DeleteRecordRequestSchema = Type.Object({
  id: Type.Number({ description: '记录 ID' }),
})

/** 老婆记录列表查询参数 Schema。 */
export const JrlpRecordsQuerySchema = Type.Object({
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  userId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  date: Type.Optional(Type.String({ description: 'YYYY-MM-DD' })),
  page: Type.Optional(Type.Number({ default: 1, minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ default: 20, minimum: 1, maximum: 100 })),
})

/* TypeScript 接口 */

export interface JrlpRecordsQuery {
  groupId?: string
  userId?: string
  date?: string
  page?: number
  pageSize?: number
}

export interface SetWifeRequest {
  groupId: number
  userId: number
  wifeQq: number
  date: string
}

export interface UpdateRecordRequest {
  id: number
  wifeQq: number
}

export interface DeleteRecordRequest {
  id: number
}
