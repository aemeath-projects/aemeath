import { describe, it, expect, vi } from 'vitest'

import { IrisBroadcaster } from '@/core/iris/broadcast.js'

const sampleMessage = {
  id: 1n,
  createdAt: new Date('2024-06-01T00:00:00Z'),
  messageId: 1001n,
  messageType: 2,
  groupId: '123456',
  userId: '987654',
  rawMessage: '你好',
  segments: [{ type: 'text', data: { text: '你好' } }],
  senderNickname: '测试用户',
  senderCard: null,
  senderRole: 'member',
  storedAt: new Date('2024-06-01T00:00:01Z'),
}

describe('IrisBroadcaster', () => {
  it('broadcast() 应当触发 message 事件并把消息传给监听器', () => {
    const broadcaster = new IrisBroadcaster()
    const listener = vi.fn()

    broadcaster.on('message', listener)
    broadcaster.broadcast(sampleMessage)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(sampleMessage)
  })

  it('多个监听器都应当收到同一条广播', () => {
    const broadcaster = new IrisBroadcaster()
    const listenerA = vi.fn()
    const listenerB = vi.fn()

    broadcaster.on('message', listenerA)
    broadcaster.on('message', listenerB)
    broadcaster.broadcast(sampleMessage)

    expect(listenerA).toHaveBeenCalledWith(sampleMessage)
    expect(listenerB).toHaveBeenCalledWith(sampleMessage)
  })

  it('off() 之后不应再收到广播', () => {
    const broadcaster = new IrisBroadcaster()
    const listener = vi.fn()

    broadcaster.on('message', listener)
    broadcaster.off('message', listener)
    broadcaster.broadcast(sampleMessage)

    expect(listener).not.toHaveBeenCalled()
  })
})
