import { Type } from '@sinclair/typebox'

export const CreateAccountBodySchema = Type.Object({
  qq: Type.String({ description: 'QQ 号（BigInt as string）' }),
  nickname: Type.Optional(Type.String()),
  role: Type.Union([Type.Literal('master'), Type.Literal('normal'), Type.Literal('readonly')]),
  transport: Type.Union([Type.Literal('ws'), Type.Literal('sse')]),
  endpoint: Type.String(),
  token: Type.Optional(Type.String()),
  isEnabled: Type.Optional(Type.Boolean({ default: true })),
})

export const UpdateAccountBodySchema = Type.Object({
  nickname: Type.Optional(Type.String()),
  endpoint: Type.Optional(Type.String()),
  token: Type.Optional(Type.String()),
  isEnabled: Type.Optional(Type.Boolean()),
})

export const AccountIdParamsSchema = Type.Object({
  id: Type.String(),
})
