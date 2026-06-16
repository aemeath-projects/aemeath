/**
 * 公共 API 请求/响应 Schema —— 分页、统一响应包装器等。
 */

import { Type } from '@sinclair/typebox'

/** 分页查询参数 Schema。 */
export const PaginationSchema = Type.Object({
  page: Type.Optional(Type.Number({ default: 1, minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ default: 20, minimum: 1, maximum: 100 })),
})

export { OkResponse, FailResponse } from '@/core/response.js'
