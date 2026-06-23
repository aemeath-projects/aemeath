/* eslint-disable import-x/order */
// vitest 的 vi.mock() 由于提升机制，作为常规导入顺序规则的例外处理
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock() 会被 vitest 提升到文件顶部
vi.mock('@langchain/openai', () => {
  const ChatOpenAI = vi.fn().mockImplementation(function (
    this: { _opts: unknown; invoke: unknown; stream: unknown },
    opts: Record<string, unknown>,
  ) {
    this._opts = opts
    this.invoke = vi.fn()
    this.stream = vi.fn()
  })
  return { ChatOpenAI }
})

import { ChatOpenAI } from '@langchain/openai'
/* eslint-enable import-x/order */

import type { LlmModel, LlmProvider } from '#prisma/main'

import { LLMClient } from '@/core/llm/index.js'

type MockedChatOpenAI = ReturnType<typeof vi.fn>

/** 构造测试用 LlmProvider。 */
function makeProvider(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    id: 'provider-uuid-001',
    name: 'TestProvider',
    apiBase: 'https://api.example.com/v1',
    apiKey: 'sk-testkey1234',
    maxRetries: 2,
    timeout: 30,
    retryInterval: 1,
    ...overrides,
  }
}

/** 构造测试用 LlmModel。 */
function makeModel(overrides: Partial<LlmModel> = {}): LlmModel {
  return {
    id: 'model-uuid-001',
    providerId: 'provider-uuid-001',
    modelName: 'gpt-4o',
    displayName: 'GPT-4o',
    inputPrice: 0.01,
    outputPrice: 0.03,
    temperature: 0.7,
    maxTokens: 2048,
    forceStream: false,
    extraParams: {},
    isEnabled: true,
    ...overrides,
  }
}

describe('LLMClient', () => {
  let client: LLMClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new LLMClient()
  })

  describe('createChatModel', () => {
    it('应当创建 ChatOpenAI 实例，并传入正确的 baseURL 和 apiKey', () => {
      const provider = makeProvider()
      const model = makeModel()

      const result = client.createChatModel(provider, model)

      expect(ChatOpenAI).toHaveBeenCalledOnce()

      const MockedClass = ChatOpenAI as unknown as MockedChatOpenAI
      const constructorArgs = MockedClass.mock.calls[0]?.[0] as Record<string, unknown>

      expect(constructorArgs).toBeDefined()
      const config = constructorArgs.configuration as { baseURL?: string }
      expect(config.baseURL).toBe('https://api.example.com/v1')
      expect(constructorArgs.openAIApiKey).toBe('sk-testkey1234')
      expect(constructorArgs.modelName).toBe('gpt-4o')
      expect(result).toBeDefined()
    })

    it('相同 provider+model 组合应当复用缓存，不重复创建', () => {
      const provider = makeProvider()
      const model = makeModel()

      const first = client.createChatModel(provider, model)
      const second = client.createChatModel(provider, model)

      expect(ChatOpenAI).toHaveBeenCalledOnce()
      expect(first).toBe(second)
    })

    it('不同模型应当创建不同实例', () => {
      const provider = makeProvider()
      const model1 = makeModel({ id: 'model-001' })
      const model2 = makeModel({ id: 'model-002', modelName: 'gpt-3.5-turbo' })

      const first = client.createChatModel(provider, model1)
      const second = client.createChatModel(provider, model2)

      expect(ChatOpenAI).toHaveBeenCalledTimes(2)
      expect(first).not.toBe(second)
    })

    it('应当将 timeout 从秒转换为毫秒传入 LangChain', () => {
      const provider = makeProvider({ timeout: 60 })
      const model = makeModel()

      client.createChatModel(provider, model)

      const MockedClass = ChatOpenAI as unknown as MockedChatOpenAI
      const constructorArgs = MockedClass.mock.calls[0]?.[0] as Record<string, unknown>
      expect(constructorArgs.timeout).toBe(60 * 1000)
    })
  })

  describe('invalidate', () => {
    it('应当清除指定 provider 的所有缓存', () => {
      const provider = makeProvider({ id: 'provider-A' })
      const model1 = makeModel({ id: 'model-001', providerId: 'provider-A' })
      const model2 = makeModel({ id: 'model-002', providerId: 'provider-A', modelName: 'claude-3' })

      client.createChatModel(provider, model1)
      client.createChatModel(provider, model2)

      vi.clearAllMocks()
      client.invalidate('provider-A')

      // 缓存已清除，再次获取应重新构建
      client.createChatModel(provider, model1)
      expect(ChatOpenAI).toHaveBeenCalledOnce()
    })

    it('invalidate 不影响其他 provider 的缓存', () => {
      const providerA = makeProvider({ id: 'provider-A' })
      const providerB = makeProvider({ id: 'provider-B', apiBase: 'https://b.example.com/v1' })
      const modelA = makeModel({ id: 'model-A', providerId: 'provider-A' })
      const modelB = makeModel({ id: 'model-B', providerId: 'provider-B' })

      const instanceB = client.createChatModel(providerB, modelB)
      client.createChatModel(providerA, modelA)

      vi.clearAllMocks()
      client.invalidate('provider-A')

      // providerB 的缓存仍在，不重新构建
      const instanceB2 = client.createChatModel(providerB, modelB)
      expect(ChatOpenAI).not.toHaveBeenCalled()
      expect(instanceB2).toBe(instanceB)
    })
  })

  describe('clear', () => {
    it('应当清空全部缓存', () => {
      const provider = makeProvider()
      const model = makeModel()

      client.createChatModel(provider, model)
      vi.clearAllMocks()

      client.clear()

      client.createChatModel(provider, model)
      expect(ChatOpenAI).toHaveBeenCalledOnce()
    })
  })
})
