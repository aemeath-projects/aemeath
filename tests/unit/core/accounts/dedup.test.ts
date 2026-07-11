import type {
  AnyOneBotEvent,
  GroupMessageEvent,
  PrivateMessageEvent,
  MessageSentEvent,
  NoticeEvent,
  Sender,
} from '@aemeath-projects/napcat/types'
import { describe, it, expect, vi } from 'vitest'

const warnMock = vi.fn()

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  getLogger: () => ({ warn: warnMock }),
}))

const { OneBotDedupKeyExtractor } = await import('@/core/accounts/index.js')

function makeSender(): Sender {
  return { userId: 200, nickname: '测试用户' }
}

function makeGroupMessageEvent(overrides: Partial<GroupMessageEvent> = {}): GroupMessageEvent {
  return {
    time: 1700000000,
    selfId: 10000,
    postType: 'message',
    messageType: 'group',
    subType: 'normal',
    messageId: 123456789012345,
    userId: 200,
    groupId: 100,
    message: [],
    rawMessage: '',
    font: 0,
    sender: makeSender(),
    ...overrides,
  }
}

function makePrivateMessageEvent(
  overrides: Partial<PrivateMessageEvent> = {},
): PrivateMessageEvent {
  return {
    time: 1700000000,
    selfId: 10000,
    postType: 'message',
    messageType: 'private',
    subType: 'friend',
    messageId: 987654321098765,
    userId: 200,
    message: [],
    rawMessage: '',
    font: 0,
    sender: makeSender(),
    ...overrides,
  }
}

function makeMessageSentEvent(overrides: Partial<MessageSentEvent> = {}): MessageSentEvent {
  return {
    time: 1700000000,
    selfId: 10000,
    postType: 'message_sent',
    messageType: 'group',
    subType: 'normal',
    messageId: 555555555555555,
    userId: 10000,
    targetId: 100,
    message: [],
    rawMessage: '',
    font: 0,
    sender: makeSender(),
    ...overrides,
  }
}

function makeNoticeEvent(overrides: Partial<NoticeEvent> = {}): NoticeEvent {
  return {
    time: 1700000000,
    selfId: 10000,
    postType: 'notice',
    noticeType: 'group_increase',
    ...overrides,
  }
}

describe('OneBotDedupKeyExtractor', () => {
  it('群消息：使用 messageId 生成 m:messageId', () => {
    const extractor = new OneBotDedupKeyExtractor()
    const event = makeGroupMessageEvent({ messageId: 123456789012345 })
    expect(extractor.extract(event)).toBe('m:123456789012345')
  })

  it('私聊消息：使用 messageId 生成 m:messageId', () => {
    const extractor = new OneBotDedupKeyExtractor()
    const event = makePrivateMessageEvent({ messageId: 987654321098765 })
    expect(extractor.extract(event)).toBe('m:987654321098765')
  })

  it('机器人自发消息（message_sent）：使用 messageId 生成 m:messageId', () => {
    const extractor = new OneBotDedupKeyExtractor()
    const event = makeMessageSentEvent({ messageId: 555555555555555 })
    expect(extractor.extract(event)).toBe('m:555555555555555')
  })

  it('相同 messageId 两次提取结果一致（去重生效的前提）', () => {
    const extractor = new OneBotDedupKeyExtractor()
    const event = makeGroupMessageEvent({ messageId: 111 })
    expect(extractor.extract(event)).toBe(extractor.extract({ ...event }))
  })

  it('messageId 缺失时返回 null 并记录 warn 日志', () => {
    warnMock.mockClear()
    const extractor = new OneBotDedupKeyExtractor()
    const event = {
      ...makeGroupMessageEvent(),
      messageId: undefined,
    } as unknown as AnyOneBotEvent
    expect(extractor.extract(event)).toBeNull()
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ postType: 'message' }),
      expect.any(String),
    )
  })

  it('非消息事件（notice）：返回 null（透传不去重）', () => {
    const extractor = new OneBotDedupKeyExtractor()
    const event = makeNoticeEvent()
    expect(extractor.extract(event)).toBeNull()
  })
})
