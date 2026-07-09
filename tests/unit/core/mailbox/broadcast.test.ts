import { describe, it, expect, vi } from 'vitest'

import { MailboxBroadcaster } from '@/core/mailbox/broadcast.js'

const sampleItem = {
  id: 'msg-1',
  title: '标题',
  content: '内容',
  isRead: false,
  readAt: null,
  createdAt: new Date(),
}

describe('MailboxBroadcaster', () => {
  it('broadcast() 应当触发 mailbox 事件并把条目传给监听器', () => {
    const broadcaster = new MailboxBroadcaster()
    const listener = vi.fn()

    broadcaster.on('mailbox', listener)
    broadcaster.broadcast(sampleItem)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(sampleItem)
  })

  it('多个监听器都应当收到同一条广播', () => {
    const broadcaster = new MailboxBroadcaster()
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    broadcaster.on('mailbox', listenerA)
    broadcaster.on('mailbox', listenerB)
    broadcaster.broadcast(sampleItem)

    expect(listenerA).toHaveBeenCalledWith(sampleItem)
    expect(listenerB).toHaveBeenCalledWith(sampleItem)
  })

  it('off() 之后不应再收到广播', () => {
    const broadcaster = new MailboxBroadcaster()
    const listener = vi.fn()

    broadcaster.on('mailbox', listener)
    broadcaster.off('mailbox', listener)
    broadcaster.broadcast(sampleItem)

    expect(listener).not.toHaveBeenCalled()
  })
})
