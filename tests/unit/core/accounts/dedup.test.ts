import { describe, it, expect } from 'vitest'

import { OneBotDedupKeyExtractor } from '@/core/accounts/index.js'

describe('OneBotDedupKeyExtractor', () => {
  const extractor = new OneBotDedupKeyExtractor()

  it('群消息：messageSeq 存在时使用 g:groupId:seq:messageSeq', () => {
    const event = { postType: 'message', groupId: 100n, messageSeq: 42 }
    expect(extractor.extract(event)).toBe('g:100:seq:42')
  })

  it('群消息：无 messageSeq 时回退到 g:groupId:u:userId:t:time', () => {
    const event = { postType: 'message', groupId: 100n, userId: 200n, time: 1700000000 }
    expect(extractor.extract(event)).toBe('g:100:u:200:t:1700000000')
  })

  it('私聊消息：使用 p:userId:t:time', () => {
    const event = { postType: 'message', messageType: 'private', userId: 200n, time: 1700000000 }
    expect(extractor.extract(event)).toBe('p:200:t:1700000000')
  })

  it('非消息事件：返回 null（透传不去重）', () => {
    const event = { postType: 'notice', noticeType: 'group_increase' }
    expect(extractor.extract(event)).toBeNull()
  })
})
