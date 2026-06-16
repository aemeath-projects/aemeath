/**
 * 配置管理 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 单项设置值请求 Schema（value 可以是任意类型，由 SettingsService 内部校验）。 */
export const SetValueRequestSchema = Type.Object({
  value: Type.Unknown(),
})

/** 批量设置值请求 Schema。 */
export const BatchSetRequestSchema = Type.Object({
  entries: Type.Array(
    Type.Object({
      key: Type.String({ minLength: 1 }),
      value: Type.Unknown(),
    }),
  ),
})

/* TypeScript 接口 */

export interface SetValueRequest {
  value: unknown
}

export interface BatchSetRequest {
  entries: { key: string; value: unknown }[]
}
