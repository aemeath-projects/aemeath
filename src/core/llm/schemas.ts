/**
 * LLM TypeBox 请求/响应 Schema 定义。
 */

import { type Static, Type } from '@sinclair/typebox'

/* 提供商 */

/** 提供商创建请求 Schema。 */
export const CreateProviderSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 64, description: '提供商名称' }),
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
  apiBase: Type.String(),
  apiKeyMasked: Type.String({ description: 'API Key 掩码（sk-****abcd）' }),
  maxRetries: Type.Integer(),
  timeout: Type.Integer(),
  retryInterval: Type.Integer(),
  modelCount: Type.Integer(),
})

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

/* Chat */

/** 单条对话消息 Schema。 */
export const ChatMessageSchema = Type.Object({
  role: Type.Union([Type.Literal('system'), Type.Literal('user'), Type.Literal('assistant')], {
    description: '消息角色',
  }),
  content: Type.String({ description: '消息内容' }),
})

/** Chat 请求 Schema。 */
export const ChatRequestSchema = Type.Object({
  modelId: Type.String({ description: '模型 UUID' }),
  messages: Type.Array(ChatMessageSchema, { minItems: 1, description: '消息列表' }),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2, description: '覆盖温度' })),
  maxTokens: Type.Optional(Type.Integer({ description: '覆盖最大 token 数' })),
  stream: Type.Boolean({ default: false, description: '是否流式输出' }),
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
export type ChatRequestData = Static<typeof ChatRequestSchema>
