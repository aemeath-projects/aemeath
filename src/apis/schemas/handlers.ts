/**
 * Handler 管理 API 响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 单个处理器方法信息 Schema。 */
const HandlerMethodSchema = Type.Object({
  name: Type.String(),
  mappingType: Type.String(),
  displayName: Type.Union([Type.String(), Type.Null()]),
  description: Type.Union([Type.String(), Type.Null()]),
  permission: Type.Union([Type.Number(), Type.Null()]),
  messageScope: Type.Union([Type.String(), Type.Null()]),
  cmd: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  pattern: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  keywords: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
  prefix: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  text: Type.Optional(Type.Union([Type.String(), Type.Null()])),
})

/** 单个控制器信息 Schema。 */
const HandlerControllerSchema = Type.Object({
  name: Type.String(),
  displayName: Type.Union([Type.String(), Type.Null()]),
  description: Type.Union([Type.String(), Type.Null()]),
  tags: Type.Optional(Type.Array(Type.String())),
  system: Type.Optional(Type.Boolean()),
  methods: Type.Array(HandlerMethodSchema),
})

/** 处理器列表响应数据 Schema —— GET /api/handlers */
export const HandlerListDataSchema = Type.Object({
  controllers: Type.Array(HandlerControllerSchema),
})
