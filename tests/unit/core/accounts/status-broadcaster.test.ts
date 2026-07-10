import { describe, it, expect, vi } from 'vitest'

import type { AccountWithStatus } from '@/core/accounts/service.js'
import { AccountStatusBroadcaster } from '@/core/accounts/status-broadcaster.js'

const sampleStatus: AccountWithStatus = {
  qq: '100000',
  nickname: '测试1',
  role: 'master',
  transport: 'ws',
  endpoint: 'ws://127.0.0.1:1',
  token: null,
  isEnabled: true,
  lastConnectedAt: null,
  disabledReason: null,
  state: 'connected',
}

describe('AccountStatusBroadcaster', () => {
  it('broadcast() 应当触发 status 事件并把状态传给监听器', () => {
    const broadcaster = new AccountStatusBroadcaster()
    const listener = vi.fn()

    broadcaster.on('status', listener)
    broadcaster.broadcast(sampleStatus)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(sampleStatus)
  })

  it('多个监听器都应当收到同一次广播', () => {
    const broadcaster = new AccountStatusBroadcaster()
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    broadcaster.on('status', listenerA)
    broadcaster.on('status', listenerB)
    broadcaster.broadcast(sampleStatus)

    expect(listenerA).toHaveBeenCalledWith(sampleStatus)
    expect(listenerB).toHaveBeenCalledWith(sampleStatus)
  })

  it('off() 之后不应再收到广播', () => {
    const broadcaster = new AccountStatusBroadcaster()
    const listener = vi.fn()

    broadcaster.on('status', listener)
    broadcaster.off('status', listener)
    broadcaster.broadcast(sampleStatus)

    expect(listener).not.toHaveBeenCalled()
  })
})
