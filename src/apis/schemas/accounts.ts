import { Type } from '@sinclair/typebox'

/** endpoint 必须以 ws:// wss:// http:// https:// 开头，避免非法值一路存进数据库直到连接时才在三方库里爆出难懂的错误。 */
export const ENDPOINT_PATTERN = '^(wss?|https?)://\\S+$'

export const CreateAccountBodySchema = Type.Object({
  qq: Type.String({ description: 'QQ 号（BigInt as string）' }),
  nickname: Type.Optional(Type.String()),
  role: Type.Union([Type.Literal('master'), Type.Literal('normal'), Type.Literal('readonly')]),
  transport: Type.Union([Type.Literal('ws'), Type.Literal('sse')]),
  endpoint: Type.String({
    pattern: ENDPOINT_PATTERN,
    description: 'WebSocket/HTTP(S) 地址，需以 ws:// wss:// http:// https:// 开头',
  }),
  token: Type.Optional(Type.String()),
  isEnabled: Type.Optional(Type.Boolean({ default: true })),
})

export const UpdateAccountBodySchema = Type.Object({
  nickname: Type.Optional(Type.String()),
  transport: Type.Optional(Type.Union([Type.Literal('ws'), Type.Literal('sse')])),
  endpoint: Type.Optional(
    Type.String({
      pattern: ENDPOINT_PATTERN,
      description: 'WebSocket/HTTP(S) 地址，需以 ws:// wss:// http:// https:// 开头',
    }),
  ),
  token: Type.Optional(Type.String()),
  isEnabled: Type.Optional(Type.Boolean()),
})

export const AccountIdParamsSchema = Type.Object({
  id: Type.String(),
})
