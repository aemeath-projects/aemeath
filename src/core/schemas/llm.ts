/**
 * LLM TypeBox 请求/响应 Schema 定义。
 */

import { type Static, Type } from '@sinclair/typebox'

/* 提供商 */

/** 供应商协议类型 Schema。 */
export const LlmProviderTypeSchema = Type.Union(
  [Type.Literal('openai'), Type.Literal('anthropic'), Type.Literal('gemini')],
  { description: '供应商协议类型' },
)

/** 提供商创建请求 Schema。 */
export const CreateProviderSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 64, description: '提供商名称' }),
  type: LlmProviderTypeSchema,
  apiBase: Type.String({ minLength: 1, maxLength: 512, description: 'API 基础地址' }),
  apiKey: Type.String({ minLength: 1, maxLength: 512, description: 'API 密钥' }),
  maxRetries: Type.Integer({ minimum: 0, maximum: 10, default: 2, description: '最大重试次数' }),
  timeout: Type.Integer({ minimum: 1, maximum: 600, default: 60, description: '请求超时 (秒)' }),
  retryInterval: Type.Integer({
    minimum: 0,
    maximum: 60,
    default: 1,
    description: '重试间隔 (秒)',
  }),
})

/** 提供商更新请求 Schema（所有字段可选）。 */
export const UpdateProviderSchema = Type.Partial(
  Type.Object({
    name: Type.String({ minLength: 1, maxLength: 64 }),
    type: LlmProviderTypeSchema,
    apiBase: Type.String({ minLength: 1, maxLength: 512 }),
    apiKey: Type.String({ minLength: 1, maxLength: 512 }),
    maxRetries: Type.Integer({ minimum: 0, maximum: 10 }),
    timeout: Type.Integer({ minimum: 1, maximum: 600 }),
    retryInterval: Type.Integer({ minimum: 0, maximum: 60 }),
  }),
)

/** 提供商响应 Schema。 */
export const LlmProviderSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  type: LlmProviderTypeSchema,
  apiBase: Type.String(),
  apiKeyMasked: Type.String({ description: 'API Key 掩码（sk-****abcd）' }),
  maxRetries: Type.Integer(),
  timeout: Type.Integer(),
  retryInterval: Type.Integer(),
  modelCount: Type.Integer(),
})

/** 提供商列表响应数据 Schema —— GET /api/llm/providers */
export const ProviderListDataSchema = Type.Array(LlmProviderSchema)

/* 模型 */

/** 模型创建请求 Schema。 */
export const CreateModelSchema = Type.Object({
  providerId: Type.String({ description: '提供商 UUID' }),
  modelName: Type.String({ minLength: 1, maxLength: 128 }),
  displayName: Type.Optional(Type.String({ maxLength: 128 })),
  inputPrice: Type.Number({ minimum: 0, default: 0 }),
  outputPrice: Type.Number({ minimum: 0, default: 0 }),
  temperature: Type.Number({ minimum: 0, maximum: 2, default: 0.7 }),
  maxTokens: Type.Optional(Type.Integer({ minimum: 1 })),
  forceStream: Type.Boolean({ default: false }),
  extraParams: Type.Object({}, { additionalProperties: true, default: {} }),
})

/** 模型更新请求 Schema（所有字段可选）。 */
export const UpdateModelSchema = Type.Partial(
  Type.Object({
    displayName: Type.Union([Type.String({ maxLength: 128 }), Type.Null()]),
    inputPrice: Type.Number({ minimum: 0 }),
    outputPrice: Type.Number({ minimum: 0 }),
    temperature: Type.Number({ minimum: 0, maximum: 2 }),
    maxTokens: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    forceStream: Type.Boolean(),
    extraParams: Type.Object({}, { additionalProperties: true }),
  }),
)

/** 模型响应 Schema。 */
export const LlmModelSchema = Type.Object({
  id: Type.String(),
  providerId: Type.String(),
  providerName: Type.String(),
  modelName: Type.String(),
  displayName: Type.Union([Type.String(), Type.Null()]),
  inputPrice: Type.Number(),
  outputPrice: Type.Number(),
  temperature: Type.Number(),
  maxTokens: Type.Union([Type.Integer(), Type.Null()]),
  forceStream: Type.Boolean(),
  extraParams: Type.Object({}, { additionalProperties: true }),
})

/** 模型列表响应数据 Schema —— GET /api/llm/models */
export const ModelListDataSchema = Type.Array(LlmModelSchema)

/* 路径参数 */

/** 提供商 ID 路径参数 —— UUID 格式。 */
export const ProviderIdParamSchema = Type.Object({
  id: Type.String({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    description: '提供商 UUID',
  }),
})

/** 模型 ID 路径参数 —— UUID 格式。 */
export const ModelIdParamSchema = Type.Object({
  id: Type.String({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    description: '模型 UUID',
  }),
})

/* 查询参数 */

/** 模型列表查询参数 —— GET /api/llm/models?providerId= */
export const ModelListQuerySchema = Type.Object({
  providerId: Type.Optional(
    Type.String({
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      description: '按提供商 UUID 筛选',
    }),
  ),
})

/* 工具函数 */

/**
 * 将 API Key 掩码为 sk-****abcd 格式。
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 3)}****${key.slice(-4)}`
}

/* 静态类型推导 */

export type CreateProviderData = Static<typeof CreateProviderSchema>
export type UpdateProviderData = Static<typeof UpdateProviderSchema>
export type CreateModelData = Static<typeof CreateModelSchema>
export type UpdateModelData = Static<typeof UpdateModelSchema>
