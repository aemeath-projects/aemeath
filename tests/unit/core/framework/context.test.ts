import type { FriendApi, GroupApi, MessageApi } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent, MessageSegment } from '@aemeath-projects/napcat/types'
import { describe, expect, it, vi } from 'vitest'

import { Context, FinishError } from '@/core/dispatch/context.js'
import type { ContextApis } from '@/core/dispatch/context.js'
import { BotApiError } from '@/core/errors.js'

/* 测试用 ContextApis mock */

interface MockApis {
  apis: ContextApis
  sendGroupMsg: ReturnType<typeof vi.fn>
  sendPrivateMsg: ReturnType<typeof vi.fn>
  deleteMsg: ReturnType<typeof vi.fn>
}

function makeMockApis(): MockApis {
  const sendGroupMsg = vi.fn().mockResolvedValue({ ok: true, data: { message_id: 100 } })
  const sendPrivateMsg = vi.fn().mockResolvedValue({ ok: true, data: { message_id: 101 } })
  const deleteMsg = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  return {
    apis: {
      msgApi: { sendGroupMsg, sendPrivateMsg, deleteMsg } as unknown as MessageApi,
      friendApi: {} as unknown as FriendApi,
      groupApi: {} as unknown as GroupApi,
    },
    sendGroupMsg,
    sendPrivateMsg,
    deleteMsg,
  }
}

/* 测试用事件工厂 */

function makeGroupMsgEvent(text: string): AnyOneBotEvent {
  const event = {
    time: 1700000000,
    self_id: 10000,
    post_type: 'message' as const,
    message_type: 'group' as const,
    sub_type: 'normal',
    message_id: 42,
    group_id: 99999,
    user_id: 11111,
    message: [{ type: 'text' as const, data: { text } }],
    raw_message: text,
    font: 0,
    sender: { user_id: 11111, nickname: 'tester', role: 'member' },
  }
  return event
}

function makePrivateMsgEvent(text: string): AnyOneBotEvent {
  const event = {
    time: 1700000001,
    self_id: 10000,
    post_type: 'message' as const,
    message_type: 'private' as const,
    sub_type: 'friend',
    message_id: 43,
    user_id: 22222,
    message: [{ type: 'text' as const, data: { text } }],
    raw_message: text,
    font: 0,
    sender: { user_id: 22222, nickname: 'friend' },
  }
  return event
}

function makeNoticeEvent(noticeType: string): AnyOneBotEvent {
  const event = {
    time: 1700000002,
    self_id: 10000,
    post_type: 'notice' as const,
    notice_type: noticeType,
    sub_type: '',
  }
  return event
}

/* FinishError */

describe('FinishError', () => {
  it('应是 Error 的子类', () => {
    const err = new FinishError()
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(FinishError)
    expect(err.name).toBe('FinishError')
  })
})

/* Context.getPlaintext */

describe('Context.getPlaintext', () => {
  it('应提取群消息纯文本', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('hello world'), apis)
    expect(ctx.getPlaintext()).toBe('hello world')
  })

  it('通知事件应返回空字符串', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeNoticeEvent('group_ban'), apis)
    expect(ctx.getPlaintext()).toBe('')
  })
})

/* Context.getArgs */

describe('Context.getArgs', () => {
  it('应返回命令名之后的参数列表', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('/echo hello world'), apis)
    expect(ctx.getArgs()).toEqual(['hello', 'world'])
  })

  it('只有命令名时应返回空数组', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('/echo'), apis)
    expect(ctx.getArgs()).toEqual([])
  })

  it('多余空格应被忽略', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('/cmd  a  b'), apis)
    expect(ctx.getArgs()).toEqual(['a', 'b'])
  })
})

/* Context.getArgStr */

describe('Context.getArgStr', () => {
  it('应返回命令名之后的原始字符串', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('/echo hello world'), apis)
    expect(ctx.getArgStr()).toBe('hello world')
  })

  it('只有命令名时应返回空字符串', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('/cmd'), apis)
    expect(ctx.getArgStr()).toBe('')
  })
})

/* isGroupEvent / isPrivateEvent */

describe('Context.isGroupEvent / isPrivateEvent', () => {
  it('群消息事件 isGroupEvent 应为 true', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), apis)
    expect(ctx.isGroupEvent()).toBe(true)
    expect(ctx.isPrivateEvent()).toBe(false)
  })

  it('私聊消息事件 isPrivateEvent 应为 true', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makePrivateMsgEvent('test'), apis)
    expect(ctx.isGroupEvent()).toBe(false)
    expect(ctx.isPrivateEvent()).toBe(true)
  })

  it('通知事件两者均应为 false', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeNoticeEvent('friend_add'), apis)
    expect(ctx.isGroupEvent()).toBe(false)
    expect(ctx.isPrivateEvent()).toBe(false)
  })
})

/* groupId / userId / messageId */

describe('Context 属性', () => {
  it('群消息 groupId 应返回正确的群 ID', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), apis)
    expect(ctx.groupId).toBe(99999)
    expect(ctx.userId).toBe(11111)
    expect(ctx.messageId).toBe(42)
  })

  it('私聊消息 groupId 应为 undefined', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makePrivateMsgEvent('test'), apis)
    expect(ctx.groupId).toBeUndefined()
    expect(ctx.userId).toBe(22222)
  })
})

/* reply */

describe('Context.reply', () => {
  it('群消息事件应调用 sendGroupMsg', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    await ctx.reply('hello')
    expect(mock.sendGroupMsg).toHaveBeenCalledOnce()
    expect(mock.sendGroupMsg).toHaveBeenCalledWith(99999, [
      { type: 'text', data: { text: 'hello' } },
    ])
  })

  it('群消息事件成功时应返回 message_id', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    const msgId = await ctx.reply('hello')
    expect(msgId).toBe(100)
  })

  it('私聊消息事件应调用 sendPrivateMsg', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makePrivateMsgEvent('test'), mock.apis)
    await ctx.reply('hi')
    expect(mock.sendPrivateMsg).toHaveBeenCalledOnce()
    expect(mock.sendPrivateMsg).toHaveBeenCalledWith(22222, [
      { type: 'text', data: { text: 'hi' } },
    ])
  })

  it('私聊消息事件成功时应返回 message_id', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makePrivateMsgEvent('test'), mock.apis)
    const msgId = await ctx.reply('hi')
    expect(msgId).toBe(101)
  })

  it('应支持传入 MessageSegment 数组', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    const segs: MessageSegment[] = [
      { type: 'text', data: { text: 'hello ' } },
      { type: 'text', data: { text: 'world' } },
    ]
    await ctx.reply(segs)
    expect(mock.sendGroupMsg).toHaveBeenCalledWith(99999, segs)
  })

  it('应支持传入单个 MessageSegment', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    const seg: MessageSegment = { type: 'text', data: { text: 'single' } }
    await ctx.reply(seg)
    expect(mock.sendGroupMsg).toHaveBeenCalledWith(99999, [seg])
  })

  it('API 返回失败时应抛出 BotApiError', async () => {
    const mock = makeMockApis()
    mock.sendGroupMsg.mockResolvedValue({
      ok: false,
      error: { code: 100, message: '消息发送失败' },
    })
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    await expect(ctx.reply('fail')).rejects.toBeInstanceOf(BotApiError)
    await expect(ctx.reply('fail')).rejects.toMatchObject({ retcode: 100, message: '消息发送失败' })
  })

  it('非消息事件应返回 undefined', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeNoticeEvent('group_ban'), mock.apis)
    const result = await ctx.reply('hello')
    expect(result).toBeUndefined()
    expect(mock.sendGroupMsg).not.toHaveBeenCalled()
  })
})

/* finish */

describe('Context.finish', () => {
  it('应抛出 FinishError', async () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), apis)
    await expect(ctx.finish()).rejects.toBeInstanceOf(FinishError)
  })

  it('带消息时应先发送再抛出 FinishError', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    await expect(ctx.finish('bye')).rejects.toBeInstanceOf(FinishError)
    expect(mock.sendGroupMsg).toHaveBeenCalledOnce()
  })
})

/* recall */

describe('Context.recall', () => {
  it('消息事件应调用 deleteMsg 并传入 message_id', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    await ctx.recall()
    expect(mock.deleteMsg).toHaveBeenCalledWith(42)
  })

  it('通知事件不应调用 deleteMsg', async () => {
    const mock = makeMockApis()
    const ctx = new Context(makeNoticeEvent('group_ban'), mock.apis)
    await ctx.recall()
    expect(mock.deleteMsg).not.toHaveBeenCalled()
  })

  it('API 返回失败时应抛出 BotApiError', async () => {
    const mock = makeMockApis()
    mock.deleteMsg.mockResolvedValue({ ok: false, error: { code: 200, message: '撤回失败' } })
    const ctx = new Context(makeGroupMsgEvent('test'), mock.apis)
    await expect(ctx.recall()).rejects.toBeInstanceOf(BotApiError)
    await expect(ctx.recall()).rejects.toMatchObject({ retcode: 200, message: '撤回失败' })
  })
})

/* 属性存储 */

describe('Context.setAttribute / getAttribute', () => {
  it('应存储并读取属性', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), apis)

    ctx.setAttribute('key', 42)
    expect(ctx.getAttribute('key')).toBe(42)
  })

  it('不存在的属性应返回 undefined', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), apis)

    expect(ctx.getAttribute('nonexistent')).toBeUndefined()
  })
})

/* 正则匹配 */

describe('Context.setRegexMatch / getRegexMatch', () => {
  it('应存储并读取正则匹配结果', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test 123'), apis)

    const match = /(\d+)/u.exec('test 123')
    expect(match).not.toBeNull()

    ctx.setRegexMatch(match!)
    expect(ctx.getRegexMatch()).toBe(match)
    expect(ctx.getRegexMatch()?.[1]).toBe('123')
  })

  it('默认应为 null', () => {
    const { apis } = makeMockApis()
    const ctx = new Context(makeGroupMsgEvent('test'), apis)

    expect(ctx.getRegexMatch()).toBeNull()
  })
})
