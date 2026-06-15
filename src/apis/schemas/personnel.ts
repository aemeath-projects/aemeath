/**
 * 人员管理 API 请求体 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 批量解析用户和群 ID 请求 Schema。 */
export const ResolveRequestSchema = Type.Object({
  userIds: Type.Optional(Type.Array(Type.Number(), { maxItems: 200 })),
  groupIds: Type.Optional(Type.Array(Type.Number(), { maxItems: 200 })),
})

/* TypeScript 接口 */

export interface ResolveRequest {
  userIds?: number[]
  groupIds?: number[]
}
