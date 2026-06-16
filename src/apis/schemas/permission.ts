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

/* ──── 路径参数 ──── */

/** 群 ID 路径参数 */
export const SettingsGroupIdParamSchema = Type.Object({
  groupId: Type.String({ pattern: '^\\d+$', description: '群号 / 群 ID' }),
})

/** 用户 ID 路径参数 */
export const SettingsUserIdParamSchema = Type.Object({
  userId: Type.String({ pattern: '^\\d+$', description: 'QQ 号 / 用户 ID' }),
})

/** 配置项 key 路径参数 */
export const SettingsKeyParamSchema = Type.Object({
  key: Type.String({ minLength: 1, description: '配置项 key（如 bot.enabled）' }),
})

/** 群级单项配置路径参数 —— :groupId + :key */
export const SettingsGroupKeyParamsSchema = Type.Object({
  groupId: Type.String({ pattern: '^\\d+$', description: '群号 / 群 ID' }),
  key: Type.String({ minLength: 1, description: '配置项 key（如 bot.enabled）' }),
})

/** 用户级单项配置路径参数 —— :userId + :key */
export const SettingsUserKeyParamsSchema = Type.Object({
  userId: Type.String({ pattern: '^\\d+$', description: 'QQ 号 / 用户 ID' }),
  key: Type.String({ minLength: 1, description: '配置项 key（如 bot.enabled）' }),
})

/* ──── 查询参数 ──── */

/** 配置查询参数 —— GET /api/settings/schemas, /groups/:groupId, /users/:userId */
export const SettingsQuerySchema = Type.Object({
  prefix: Type.Optional(Type.String({ description: '按前缀筛选配置项' })),
})

/* TypeScript 接口 */

export interface SetValueRequest {
  value: unknown
}

export interface BatchSetRequest {
  entries: { key: string; value: unknown }[]
}
