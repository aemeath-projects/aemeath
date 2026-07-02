/**
 * 统一 API 响应格式 —— 所有 REST API 端点均使用 ok() / fail() 构造响应。
 */

import { Type } from '@sinclair/typebox'
import type { TSchema } from '@sinclair/typebox'

/** 统一响应结构。 */
export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message: string
}

/** 构造成功响应。 */
export function ok<T>(data: T, message = 'success'): ApiResponse<T> {
  return { code: 0, data, message }
}

/** 构造失败响应。 */
export function fail(message: string, data: unknown = null): ApiResponse {
  return { code: -1, data, message }
}

/* TypeBox 响应 Schema 工具 */

/**
 * 构造成功响应 Schema 包装器。
 *
 * @example OkResponse(Type.Object({ id: Type.Number() }))
 */
export function OkResponse<T extends TSchema>(dataSchema: T) {
  return Type.Object({
    code: Type.Literal(0),
    data: dataSchema,
    message: Type.String(),
  })
}

/**
 * 构造失败响应 Schema 包装器。
 */
export function FailResponse() {
  return Type.Object({
    code: Type.Literal(-1),
    data: Type.Unknown(),
    message: Type.String(),
  })
}
