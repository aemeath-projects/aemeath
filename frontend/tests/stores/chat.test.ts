/** Chat Store 单元测试：实时消息推送（connectLive/disconnectLive）。 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatStore } from '@/stores/chat'
import type { ChatMessage } from '@/apis/chat'

vi.mock('@/apis/chat', () => ({
  fetchGroupMessages: vi.fn(),
  fetchPrivateMessages: vi.fn(),
  fetchMessageContext: vi.fn(),
  fetchArchives: vi.fn(),
  triggerArchive: vi.fn(),
  queryArchive: vi.fn(),
  connectChatMessageStream: vi.fn(),
}))

import * as chatApi from '@/apis/chat'

const mockMessage: ChatMessage = {
  id: 1,
  messageId: 1001,
  messageType: 2,
  groupId: '123456',
  userId: '987654',
  rawMessage: '你好',
  segments: [],
  senderNickname: '测试用户',
  senderCard: null,
  senderRole: null,
  createdAt: '2026-07-12T00:00:00.000Z',
  storedAt: '2026-07-12T00:00:01.000Z',
}

describe('useChatStore - 实时推送', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('connectLive 收到消息后应当把消息插入到 messages 列表头部', () => {
    let onMessageCallback: ((msg: ChatMessage) => void) | undefined
    vi.mocked(chatApi.connectChatMessageStream).mockImplementation((_target, onMessage) => {
      onMessageCallback = onMessage
      return vi.fn()
    })

    const store = useChatStore()
    store.connectLive({ groupId: '123456' })
    onMessageCallback?.(mockMessage)

    expect(store.messages[0]).toEqual(mockMessage)
  })

  it('connectLive 应当把 target 透传给 connectChatMessageStream', () => {
    vi.mocked(chatApi.connectChatMessageStream).mockReturnValue(vi.fn())
    const store = useChatStore()

    store.connectLive({ userId: '987654' })

    expect(chatApi.connectChatMessageStream).toHaveBeenCalledWith(
      { userId: '987654' },
      expect.any(Function),
    )
  })

  it('重复调用 connectLive 应当先关闭旧连接再建立新连接', () => {
    const closeFnA = vi.fn()
    const closeFnB = vi.fn()
    vi.mocked(chatApi.connectChatMessageStream)
      .mockReturnValueOnce(closeFnA)
      .mockReturnValueOnce(closeFnB)

    const store = useChatStore()
    store.connectLive({ groupId: '111' })
    store.connectLive({ groupId: '222' })

    expect(closeFnA).toHaveBeenCalledOnce()
    expect(chatApi.connectChatMessageStream).toHaveBeenCalledTimes(2)
  })

  it('disconnectLive 应当调用关闭函数', () => {
    const closeFn = vi.fn()
    vi.mocked(chatApi.connectChatMessageStream).mockReturnValue(closeFn)
    const store = useChatStore()

    store.connectLive({ groupId: '123456' })
    store.disconnectLive()

    expect(closeFn).toHaveBeenCalledOnce()
  })

  it('未建立连接时调用 disconnectLive 不应报错', () => {
    const store = useChatStore()
    expect(() => store.disconnectLive()).not.toThrow()
  })
})
