/**
 * Bot 信息 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 修改 Bot 资料请求 Schema。 */
export const BotProfileUpdateRequestSchema = Type.Object({
  nickname: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  personalNote: Type.Optional(Type.Union([Type.String(), Type.Null()])),
})

/* TypeScript 接口 */

export interface BotProfileUpdateRequest {
  nickname?: string | null
  personalNote?: string | null
}
