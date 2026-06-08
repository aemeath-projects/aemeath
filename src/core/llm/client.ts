/**
 * OpenAI 兼容 LLM 客户端封装 —— 维护按 providerId 缓存的 ChatOpenAI 实例池。
 */

import { ChatOpenAI } from '@langchain/openai'

import type { LlmProvider, LlmModel } from '#prisma/main'

export type { LlmProvider, LlmModel }

/** 缓存条目。 */
interface CachedModel {
  model: ChatOpenAI
  apiBase: string
  apiKey: string
}

/**
 * 基于 LangChain ChatOpenAI 的通用 LLM 调用客户端，兼容 OpenAI API 协议。
 *
 * 内部维护一个按 providerId 缓存的 ChatOpenAI 实例池，避免重复创建客户端。
 */
export class LLMClient {
  private readonly _cache = new Map<string, CachedModel>()

  /**
   * 根据 provider 和 model 配置创建（或复用缓存）ChatOpenAI 实例。
   *
   * @param provider - LlmProvider ORM 对象
   * @param model    - LlmModel ORM 对象
   * @returns BaseChatModel（LangChain 统一接口）
   */
  createChatModel(provider: LlmProvider, model: LlmModel): ChatOpenAI {
    const cacheKey = `${provider.id}::${model.id}`
    const cached = this._cache.get(cacheKey)

    if (cached) return cached.model

    const chatModel = new ChatOpenAI({
      modelName: model.modelName,
      temperature: model.temperature,
      maxTokens: model.maxTokens ?? undefined,
      streaming: model.forceStream,
      openAIApiKey: provider.apiKey,
      configuration: {
        baseURL: provider.apiBase,
      },
      maxRetries: provider.maxRetries,
      timeout: provider.timeout * 1000, // LangChain 使用毫秒
    })

    this._cache.set(cacheKey, {
      model: chatModel,
      apiBase: provider.apiBase,
      apiKey: provider.apiKey,
    })

    return chatModel
  }

  /**
   * 使指定提供商所有缓存的客户端失效（配置更新时调用）。
   */
  invalidate(providerId: string): void {
    for (const key of this._cache.keys()) {
      if (key.startsWith(`${providerId}::`)) {
        this._cache.delete(key)
      }
    }
  }

  /** 清空全部缓存。 */
  clear(): void {
    this._cache.clear()
  }
}
