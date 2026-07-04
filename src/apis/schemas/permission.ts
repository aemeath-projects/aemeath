/**
 * 配置管理 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/* Path 相关 —— 与 src/core/settings/path.ts 的字符限制保持一致（禁止 ':' 和 '/'） */

/** scope 路径单段 Schema。 */
export const PathSegmentSchema = Type.Object({
  type: Type.String({ pattern: '^[^:/]+$', description: "段类型，禁止包含 ':' 或 '/'" }),
  id: Type.String({ pattern: '^[^:/]+$', description: "段 ID，禁止包含 ':' 或 '/'" }),
})

/** scope 路径 Schema，从外到内排序，空数组表示系统级。 */
export const PathSchema = Type.Array(PathSegmentSchema)

/* 请求体 */

/** 单项设置值请求 Schema（value 可以是任意类型，由 SettingsService 内部校验）。 */
export const SetValueRequestSchema = Type.Object({
  value: Type.Unknown(),
  path: PathSchema,
})

/** 批量设置值请求 Schema。 */
export const BatchSetRequestSchema = Type.Object({
  entries: Type.Array(
    Type.Object({
      key: Type.String({ minLength: 1 }),
      value: Type.Unknown(),
    }),
  ),
  path: PathSchema,
})

/* 路径参数 */

/** 配置项 key 路径参数 */
export const SettingsKeyParamSchema = Type.Object({
  key: Type.String({ minLength: 1, description: '配置项 key（如 bot.enabled）' }),
})

/* 查询参数 */

/** GET /api/settings/schemas 查询参数。 */
export const SettingsQuerySchema = Type.Object({
  prefix: Type.Optional(Type.String({ description: '按前缀筛选配置项' })),
})

/** GET /api/settings/values 查询参数 —— path 为 URL 编码的 JSON 数组字符串。 */
export const SettingsValuesQuerySchema = Type.Object({
  prefix: Type.Optional(Type.String({ description: '按前缀筛选配置项' })),
  path: Type.Optional(Type.String({ description: 'URL 编码的 Path JSON 数组，省略即系统级' })),
})

/* TypeScript 接口 */

export interface PathSegment {
  readonly type: string
  readonly id: string
}

export type PathValue = readonly PathSegment[]

export interface SetValueRequest {
  value: unknown
  path: PathValue
}

export interface BatchSetRequest {
  entries: { key: string; value: unknown }[]
  path: PathValue
}

/* 响应数据 Schema */

/** 配置项 Schema 元信息 —— GET /api/settings/schemas */
export const SettingNodeSchemaItem = Type.Object({
  key: Type.String({ description: '配置项 key' }),
  type: Type.Union(
    [Type.Literal('boolean'), Type.Literal('number'), Type.Literal('string'), Type.Literal('enum')],
    { description: '值类型' },
  ),
  default: Type.Unknown({ description: '默认值' }),
  description: Type.String({ description: '描述' }),
  enumOptions: Type.Optional(Type.Record(Type.String(), Type.Number())),
  applicableScopeHint: Type.Optional(Type.Array(Type.String())),
  owner: Type.String({ description: '所属组件名' }),
  ownerDisplayName: Type.String({ description: '所属组件显示名称' }),
  category: Type.Union([Type.Literal('permission'), Type.Literal('config')]),
})

/** Schema 列表响应数据 —— GET /api/settings/schemas */
export const SettingsSchemaListDataSchema = Type.Array(SettingNodeSchemaItem)

/** 单项配置条目 Schema —— { value, overridden, overriddenAtDepth } */
export const SettingsEntrySchema = Type.Object({
  value: Type.Unknown({ description: '当前生效值' }),
  overridden: Type.Boolean({ description: '是否已被覆盖（非默认值）' }),
  overriddenAtDepth: Type.Union([Type.Number(), Type.Null()], {
    description: '覆盖发生的深度：0 表示系统级根，null 表示未覆盖',
  }),
})

/** 配置 Record 响应数据 —— GET /api/settings/values */
export const SettingsRecordDataSchema = Type.Record(Type.String(), SettingsEntrySchema)
