/** Accounts Store 单元测试：账号列表加载与 SSE 实时状态更新。 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAccountsStore } from '@/stores/accounts'

vi.mock('@/apis/accounts', () => ({
  listAccountsWithStatus: vi.fn(),
  connectAccountStatusStream: vi.fn(),
}))

import * as accountsApi from '@/apis/accounts'
import type { AccountStatusEvent } from '@/apis/accounts'

const mockAccount = {
  qq: '100000',
  nickname: '测试1',
  role: 'master' as const,
  transport: 'ws' as const,
  endpoint: 'ws://127.0.0.1:1',
  token: null,
  isEnabled: true,
  state: 'disconnected' as const,
}

describe('useAccountsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始 accounts 为空数组，loading 为 false', () => {
    const store = useAccountsStore()
    expect(store.accounts).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('load() 应当写入 accounts', async () => {
    vi.mocked(accountsApi.listAccountsWithStatus).mockResolvedValue([mockAccount])
    const store = useAccountsStore()

    await store.load()

    expect(store.accounts).toEqual([mockAccount])
    expect(store.loading).toBe(false)
  })

  it('applyStatusEvent 应当更新本地列表中已存在账号的字段', async () => {
    vi.mocked(accountsApi.listAccountsWithStatus).mockResolvedValue([mockAccount])
    const store = useAccountsStore()
    await store.load()

    store.applyStatusEvent({ ...mockAccount, state: 'connected' })

    expect(store.accounts[0]?.state).toBe('connected')
  })

  it('applyStatusEvent 遇到本地列表中不存在的账号时忽略', async () => {
    vi.mocked(accountsApi.listAccountsWithStatus).mockResolvedValue([mockAccount])
    const store = useAccountsStore()
    await store.load()

    store.applyStatusEvent({ ...mockAccount, qq: '999999', state: 'connected' })

    expect(store.accounts).toHaveLength(1)
    expect(store.accounts[0]?.qq).toBe('100000')
  })

  it('connectStream 收到状态事件后调用 applyStatusEvent', () => {
    let onMessageCallback: ((evt: AccountStatusEvent) => void) | undefined
    vi.mocked(accountsApi.connectAccountStatusStream).mockImplementation((onMessage) => {
      onMessageCallback = onMessage
      return vi.fn()
    })
    const store = useAccountsStore()
    store.accounts.push(mockAccount)

    store.connectStream()
    onMessageCallback?.({ ...mockAccount, state: 'connected' })

    expect(store.accounts[0]?.state).toBe('connected')
  })

  it('重复调用 connectStream 不应重复建立连接', () => {
    vi.mocked(accountsApi.connectAccountStatusStream).mockReturnValue(vi.fn())
    const store = useAccountsStore()

    store.connectStream()
    store.connectStream()

    expect(accountsApi.connectAccountStatusStream).toHaveBeenCalledOnce()
  })

  it('onReconnect 回调触发时调用 load()', () => {
    vi.mocked(accountsApi.listAccountsWithStatus).mockResolvedValue([mockAccount])
    let onReconnectCallback: (() => void) | undefined
    vi.mocked(accountsApi.connectAccountStatusStream).mockImplementation((_onMessage, onReconnect) => {
      onReconnectCallback = onReconnect
      return vi.fn()
    })
    const store = useAccountsStore()

    store.connectStream()
    onReconnectCallback?.()

    expect(accountsApi.listAccountsWithStatus).toHaveBeenCalled()
  })

  it('disconnectStream 应当调用关闭函数', () => {
    const closeFn = vi.fn()
    vi.mocked(accountsApi.connectAccountStatusStream).mockReturnValue(closeFn)
    const store = useAccountsStore()

    store.connectStream()
    store.disconnectStream()

    expect(closeFn).toHaveBeenCalledOnce()
  })
})
