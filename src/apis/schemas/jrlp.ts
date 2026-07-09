/**
 * 今日老婆 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 单条记录响应 Schema。 */
export const WifeRecordResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
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
  groupId: Type.String({ description: '群号' }),
  userId: Type.String({ description: '抽取者 QQ' }),
  wifeQq: Type.String({ description: '老婆 QQ' }),
  date: Type.String({ description: '日期（YYYY-MM-DD）' }),
})

/** 修改记录请求 Schema。 */
export const UpdateRecordRequestSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: '记录 ID' }),
  wifeQq: Type.String({ description: '新老婆 QQ' }),
})

/** 删除记录请求 Schema。 */
export const DeleteRecordRequestSchema = Type.Object({
  id: Type.String({ format: 'uuid', description: '记录 ID' }),
})

/** 老婆记录列表查询参数 Schema。 */
export const JrlpRecordsQuerySchema = Type.Object({
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  userId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  date: Type.Optional(Type.String({ description: 'YYYY-MM-DD' })),
  page: Type.Optional(Type.String({ pattern: '^\\d+$', description: '页码（默认 1）' })),
  pageSize: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '每页条数（默认 20，最大 100）' }),
  ),
})

/* TypeScript 接口 */

export interface JrlpRecordsQuery {
  groupId?: string
  userId?: string
  date?: string
  page?: string
  pageSize?: string
}

export interface SetWifeRequest {
  groupId: string
  userId: string
  wifeQq: string
  date: string
}

export interface UpdateRecordRequest {
  id: string
  wifeQq: string
}

export interface DeleteRecordRequest {
  id: string
}
