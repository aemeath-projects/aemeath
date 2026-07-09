/** Mailbox Store 单元测试：未读数管理与 SSE 实时推送。 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMailboxStore } from '@/stores/mailbox'

vi.mock('@/apis/mailbox', () => ({
  fetchUnreadCount: vi.fn(),
  connectMailboxStream: vi.fn(),
}))

import * as mailboxApi from '@/apis/mailbox'

const mockItem = {
  id: 'msg-1',
  title: '新反馈通知',
  content: '内容',
  isRead: false,
  readAt: null,
  createdAt: '2026-07-09T00:00:00.000Z',
}

describe('useMailboxStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始 unreadCount 为 0，latestMessage 为 null', () => {
    const store = useMailboxStore()
    expect(store.unreadCount).toBe(0)
    expect(store.latestMessage).toBeNull()
  })

  it('fetchUnreadCount 应当写入 unreadCount', async () => {
    vi.mocked(mailboxApi.fetchUnreadCount).mockResolvedValue({ count: 3 })
    const store = useMailboxStore()

    await store.fetchUnreadCount()

    expect(store.unreadCount).toBe(3)
  })

  it('connectSSE 收到消息后应当自增 unreadCount 并更新 latestMessage', () => {
    let onMessageCallback: ((item: typeof mockItem) => void) | undefined
    vi.mocked(mailboxApi.connectMailboxStream).mockImplementation((onMessage) => {
      onMessageCallback = onMessage
      return vi.fn()
    })

    const store = useMailboxStore()
    store.connectSSE()
    onMessageCallback?.(mockItem)

    expect(store.unreadCount).toBe(1)
    expect(store.latestMessage).toEqual(mockItem)
  })

  it('重复调用 connectSSE 不应重复建立连接', () => {
    vi.mocked(mailboxApi.connectMailboxStream).mockReturnValue(vi.fn())
    const store = useMailboxStore()

    store.connectSSE()
    store.connectSSE()

    expect(mailboxApi.connectMailboxStream).toHaveBeenCalledOnce()
  })

  it('disconnectSSE 应当调用关闭函数', () => {
    const closeFn = vi.fn()
    vi.mocked(mailboxApi.connectMailboxStream).mockReturnValue(closeFn)
    const store = useMailboxStore()

    store.connectSSE()
    store.disconnectSSE()

    expect(closeFn).toHaveBeenCalledOnce()
  })

  it('decrementUnread 不应把 unreadCount 减到负数', () => {
    const store = useMailboxStore()
    store.decrementUnread()
    expect(store.unreadCount).toBe(0)
  })
})
