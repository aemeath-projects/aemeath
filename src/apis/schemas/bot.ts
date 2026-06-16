/**
 * Bot 信息 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 修改 Bot 资料请求 Schema。 */
export const BotProfileUpdateRequestSchema = Type.Object({
  nickname: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  personalNote: Type.Optional(Type.Union([Type.String(), Type.Null()])),
})

/* ──── 响应 Schema ──── */

/** Bot 登录信息响应数据 Schema —— GET /api/bot/info */
export const BotInfoDataSchema = Type.Object({
  nickname: Type.Union([Type.String(), Type.Null()]),
  userId: Type.Union([Type.Number(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
})

/** Bot 完整资料响应数据 Schema —— GET /api/bot/profile */
export const BotProfileDataSchema = Type.Object({
  nickname: Type.Union([Type.String(), Type.Null()]),
  userId: Type.Union([Type.Number(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  online: Type.Boolean(),
  version: Type.Record(Type.String(), Type.String()),
})

/* TypeScript 接口 */

export interface BotProfileUpdateRequest {
  nickname?: string | null
  personalNote?: string | null
}
