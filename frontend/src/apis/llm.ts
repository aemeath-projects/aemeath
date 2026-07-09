/**
 * LLM API 接口层 —— 封装 /api/llm 所有后端接口调用。
 */

import { get, post, put, del } from './http'

/* 类型定义 */

export type LlmProviderType = 'openai' | 'anthropic' | 'gemini'

export interface ProviderItem {
  id: string
  name: string
  type: LlmProviderType
  apiBase: string
  apiKeyMasked: string
  modelCount: number
}

export interface ProviderDetail extends ProviderItem {
  models: ModelItem[]
}

export interface ProviderCreateData {
  name: string
  type: LlmProviderType
  apiBase: string
  apiKey: string
}

export interface ProviderUpdateData {
  name?: string
  type?: LlmProviderType
  apiBase?: string
  apiKey?: string
}

export interface ModelItem {
  id: string
  providerId: string
  providerName: string
  modelName: string
  displayName: string | null
  temperature: number
  maxTokens: number | null
  forceStream: boolean
  extraParams: Record<string, unknown>
}

export interface ModelCreateData {
  providerId: string
  modelName: string
  displayName?: string | null
  temperature?: number
  maxTokens?: number | null
  forceStream?: boolean
  extraParams?: Record<string, unknown>
}

export interface ModelUpdateData {
  displayName?: string | null
  temperature?: number
  maxTokens?: number | null
  forceStream?: boolean
  extraParams?: Record<string, unknown>
}

export interface TestResult {
  success: boolean
  message: string
  model?: string | null
}

/* API 调用 */

const BASE = '/api/llm'

export async function fetchProviders(): Promise<ProviderItem[]> {
  return get<ProviderItem[]>(`${BASE}/providers`)
}

export async function fetchProvider(id: string): Promise<ProviderDetail> {
  return get<ProviderDetail>(`${BASE}/providers/${id}`)
}

export async function createProvider(payload: ProviderCreateData): Promise<ProviderItem> {
  return post<ProviderItem>(`${BASE}/providers`, payload)
}

export async function updateProvider(
  id: string,
  payload: ProviderUpdateData,
): Promise<ProviderItem> {
  return put<ProviderItem>(`${BASE}/providers/${id}`, payload)
}

export async function deleteProvider(id: string): Promise<void> {
  await del<null>(`${BASE}/providers/${id}`)
}

export async function testProvider(id: string): Promise<TestResult> {
  return post<TestResult>(`${BASE}/providers/${id}/test`)
}

export async function fetchModels(providerId?: string): Promise<ModelItem[]> {
  const params: Record<string, string> = {}
  if (providerId) params.providerId = providerId
  return get<ModelItem[]>(`${BASE}/models`, params)
}

export async function fetchModel(id: string): Promise<ModelItem> {
  return get<ModelItem>(`${BASE}/models/${id}`)
}

export async function createModel(payload: ModelCreateData): Promise<ModelItem> {
  return post<ModelItem>(`${BASE}/models`, payload)
}

export async function updateModel(id: string, payload: ModelUpdateData): Promise<ModelItem> {
  return put<ModelItem>(`${BASE}/models/${id}`, payload)
}

export async function deleteModel(id: string): Promise<void> {
  await del<null>(`${BASE}/models/${id}`)
}
