import { Type } from '@sinclair/typebox'

export const SetPriorityModeBodySchema = Type.Object({
  mode: Type.Union([Type.Literal('prefer_master'), Type.Literal('prefer_normal')]),
})
