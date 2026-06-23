import {
  MessageScope,
  Permission,
  type HandlerMethod,
  CommandHandlerMapping,
  CompositeHandlerMapping,
  EndsWithHandlerMapping,
  EventTypeHandlerMapping,
  FullMatchHandlerMapping,
  KeywordHandlerMapping,
  RegexHandlerMapping,
  StartsWithHandlerMapping,
  Context,
} from '@aemeath-projects/exostrider/dispatch'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import { beforeEach, describe, expect, it } from 'vitest'

import { oneBotContextConfig } from '@/core/dispatch/index.js'
import type { ContextApis } from '@/core/dispatch/index.js'

/* 测试用事件工厂 */

function makeGroupMsgEvent(text: string): AnyOneBotEvent {
  const event = {
    time: 1700000000,
    selfId: 10000,
    postType: 'message' as const,
    messageType: 'group' as const,
    subType: 'normal',
    messageId: 1,
    groupId: 99999,
    userId: 11111,
    message: [{ type: 'text' as const, data: { text } }],
    rawMessage: text,
    font: 0,
    sender: { userId: 11111, nickname: 'tester', role: 'member' },
  }
  return event
}

function makePrivateMsgEvent(text: string): AnyOneBotEvent {
  const event = {
    time: 1700000001,
    selfId: 10000,
    postType: 'message' as const,
    messageType: 'private' as const,
    subType: 'friend',
    messageId: 2,
    userId: 22222,
    message: [{ type: 'text' as const, data: { text } }],
    rawMessage: text,
    font: 0,
    sender: { userId: 22222, nickname: 'friend' },
  }
  return event
}

function makeNoticeEvent(noticeType: string, subType?: string): AnyOneBotEvent {
  const event = {
    time: 1700000002,
    selfId: 10000,
    postType: 'notice' as const,
    noticeType: noticeType,
    subType: subType ?? '',
  }
  return event
}

function makeRequestEvent(requestType: string): AnyOneBotEvent {
  const event = {
    time: 1700000003,
    selfId: 10000,
    postType: 'request' as const,
    requestType: requestType,
    userId: 33333,
    comment: '',
    flag: 'test',
  }
  return event
}

/** 构建 Context 供映射层使用 */
const EMPTY_APIS: ContextApis = {
  msgApi: {} as ContextApis['msgApi'],
  friendApi: {} as ContextApis['friendApi'],
  groupApi: {} as ContextApis['groupApi'],
}

function makeCtx(event: AnyOneBotEvent, scope?: string): Context<AnyOneBotEvent, ContextApis> {
  const ctx = new Context(event, EMPTY_APIS, oneBotContextConfig)
  ctx.scope = scope
  return ctx
}

/* 处理器工厂 */

function makeHandler(
  overrides: Partial<HandlerMethod> = {},
  triggerAndMeta: Partial<Pick<HandlerMethod, 'mappingType' | 'trigger'>> &
    Record<string, unknown> = {},
): HandlerMethod {
  const { mappingType, trigger, ...rest } = triggerAndMeta
  return {
    instance: {},
    method: () => {},
    methodName: 'handle',
    handlerName: 'test',
    priority: 50,
    scope: undefined,
    permission: Permission.ANYONE,
    mappingType: mappingType ?? 'command',
    trigger: trigger ?? {},
    interceptors: [],
    ...rest,
    ...overrides,
  } as unknown as HandlerMethod
}

/* CommandHandlerMapping */

describe('CommandHandlerMapping', () => {
  let mapping: CommandHandlerMapping

  beforeEach(() => {
    mapping = new CommandHandlerMapping('/')
  })

  it('应匹配以 / 开头的命令', () => {
    const handler = makeHandler({}, { mappingType: 'command', trigger: { cmd: 'echo' } })
    mapping.register(handler)

    const result = mapping.getHandler(makeCtx(makeGroupMsgEvent('/echo hello')))
    expect(result).toBe(handler)
  })

  it('没有命令前缀的消息不应匹配', () => {
    const handler = makeHandler({}, { mappingType: 'command', trigger: { cmd: 'echo' } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('echo hello')))).toBeUndefined()
  })

  it('不同命令不应相互匹配', () => {
    const handler = makeHandler({}, { mappingType: 'command', trigger: { cmd: 'help' } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('/echo hello')))).toBeUndefined()
  })

  it('应支持 aliases', () => {
    const handler = makeHandler(
      {},
      { mappingType: 'command', trigger: { cmd: 'ping', aliases: new Set(['p', 'pong']) } },
    )
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('/ping')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('/p')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('/pong')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('/unknown')))).toBeUndefined()
  })

  it('非消息事件不应匹配', () => {
    const handler = makeHandler({}, { mappingType: 'command', trigger: { cmd: 'echo' } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeNoticeEvent('group_ban')))).toBeUndefined()
  })

  it('空文本不应匹配', () => {
    const handler = makeHandler({}, { mappingType: 'command', trigger: { cmd: 'echo' } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('/')))).toBeUndefined()
  })

  it('registeredCount 应正确计数', () => {
    mapping.register(makeHandler({}, { mappingType: 'command', trigger: { cmd: 'a' } }))
    mapping.register(makeHandler({}, { mappingType: 'command', trigger: { cmd: 'b' } }))
    expect(mapping.registeredCount).toBe(2)
  })
})

/* RegexHandlerMapping */

describe('RegexHandlerMapping', () => {
  let mapping: RegexHandlerMapping

  beforeEach(() => {
    mapping = new RegexHandlerMapping()
  })

  it('应匹配符合正则的消息', () => {
    const handler = makeHandler(
      {},
      {
        mappingType: 'regex',
        trigger: {
          compiledPattern: /hello\s+world/u,
        },
      },
    )
    mapping.register(handler)

    const ctx = makeCtx(makeGroupMsgEvent('say hello world to me'))
    const result = mapping.getHandler(ctx)
    expect(result).toBe(handler)
    expect(ctx.regexMatch).not.toBeNull()
  })

  it('不匹配正则的消息应返回 undefined', () => {
    const handler = makeHandler({}, { mappingType: 'regex', trigger: { compiledPattern: /foo/u } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('bar')))).toBeUndefined()
  })

  it('应返回 regexMatch', () => {
    const handler = makeHandler(
      {},
      { mappingType: 'regex', trigger: { compiledPattern: /(\d+)/u } },
    )
    mapping.register(handler)

    const ctx = makeCtx(makeGroupMsgEvent('order 42 items'))
    mapping.getHandler(ctx)
    expect(ctx.regexMatch?.[1]).toBe('42')
  })
})

/* KeywordHandlerMapping */

describe('KeywordHandlerMapping', () => {
  let mapping: KeywordHandlerMapping

  beforeEach(() => {
    mapping = new KeywordHandlerMapping()
  })

  it('包含关键词时应匹配', () => {
    const handler = makeHandler(
      {},
      { mappingType: 'keyword', trigger: { keywords: new Set(['cat', 'dog']) } },
    )
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('I love my dog')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('a cat is here')))).toBe(handler)
  })

  it('不包含关键词时不应匹配', () => {
    const handler = makeHandler(
      {},
      { mappingType: 'keyword', trigger: { keywords: new Set(['cat', 'dog']) } },
    )
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('I have a fish')))).toBeUndefined()
  })
})

/* StartsWithHandlerMapping */

describe('StartsWithHandlerMapping', () => {
  let mapping: StartsWithHandlerMapping

  beforeEach(() => {
    mapping = new StartsWithHandlerMapping()
  })

  it('以指定前缀开头时应匹配', () => {
    const handler = makeHandler({}, { mappingType: 'startswith', trigger: { prefix: '!cmd' } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('!cmd do something')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('!other')))).toBeUndefined()
  })
})

/* EndsWithHandlerMapping */

describe('EndsWithHandlerMapping', () => {
  let mapping: EndsWithHandlerMapping

  beforeEach(() => {
    mapping = new EndsWithHandlerMapping()
  })

  it('以指定后缀结尾时应匹配', () => {
    const handler = makeHandler({}, { mappingType: 'endswith', trigger: { suffix: '吗？' } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('你好吗？')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('你好！')))).toBeUndefined()
  })
})

/* FullMatchHandlerMapping */

describe('FullMatchHandlerMapping', () => {
  let mapping: FullMatchHandlerMapping

  beforeEach(() => {
    mapping = new FullMatchHandlerMapping()
  })

  it('完全匹配时应返回结果', () => {
    const handler = makeHandler({}, { mappingType: 'fullmatch', trigger: { text: '菜单' } })
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('菜单')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('菜单列表')))).toBeUndefined()
  })
})

/* EventTypeHandlerMapping */

describe('EventTypeHandlerMapping', () => {
  let mapping: EventTypeHandlerMapping

  beforeEach(() => {
    mapping = new EventTypeHandlerMapping()
  })

  it('应匹配对应 post_type 的事件', () => {
    const handler = makeHandler(
      {},
      { mappingType: 'event', trigger: { matchConfig: { postType: 'notice' } } },
    )
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeNoticeEvent('group_ban')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeGroupMsgEvent('hello')))).toBeUndefined()
  })

  it('应按 notice_type 过滤', () => {
    const handler = makeHandler(
      {},
      {
        mappingType: 'event',
        trigger: { matchConfig: { postType: 'notice', noticeType: 'group_ban' } },
      },
    )
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeNoticeEvent('group_ban')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeNoticeEvent('friend_add')))).toBeUndefined()
  })

  it('应按 sub_type 过滤', () => {
    const handler = makeHandler(
      {},
      {
        mappingType: 'event',
        trigger: { matchConfig: { postType: 'notice', noticeType: 'notify', subType: 'poke' } },
      },
    )
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeNoticeEvent('notify', 'poke')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeNoticeEvent('notify', 'gray_tip')))).toBeUndefined()
  })

  it('应按 request_type 过滤', () => {
    const handler = makeHandler(
      {},
      {
        mappingType: 'event',
        trigger: { matchConfig: { postType: 'request', requestType: 'friend' } },
      },
    )
    mapping.register(handler)

    expect(mapping.getHandler(makeCtx(makeRequestEvent('friend')))).toBe(handler)
    expect(mapping.getHandler(makeCtx(makeRequestEvent('group')))).toBeUndefined()
  })
})

/* CompositeHandlerMapping */

describe('CompositeHandlerMapping', () => {
  let composite: CompositeHandlerMapping

  beforeEach(() => {
    composite = new CompositeHandlerMapping()
  })

  it('应将 command 类型路由到 CommandHandlerMapping', () => {
    const handler = makeHandler({}, { mappingType: 'command', trigger: { cmd: 'echo' } })
    composite.register(handler)

    const result = composite.getHandler(makeCtx(makeGroupMsgEvent('/echo hello')))
    expect(result).toBe(handler)
  })

  it('应将 event_type 路由到 EventTypeHandlerMapping', () => {
    const handler = makeHandler(
      {},
      { mappingType: 'event', trigger: { matchConfig: { postType: 'notice' } } },
    )
    composite.register(handler)

    expect(composite.getHandler(makeCtx(makeNoticeEvent('group_ban')))).toBe(handler)
  })

  it('MessageScope.GROUP 应只匹配群消息', () => {
    const handler = makeHandler(
      { scope: MessageScope.GROUP },
      { mappingType: 'command', trigger: { cmd: 'test' } },
    )
    composite.register(handler)

    expect(composite.getHandler(makeCtx(makeGroupMsgEvent('/test'), MessageScope.GROUP))).toBe(
      handler,
    )
    expect(
      composite.getHandler(makeCtx(makePrivateMsgEvent('/test'), MessageScope.PRIVATE)),
    ).toBeUndefined()
  })

  it('MessageScope.PRIVATE 应只匹配私聊消息', () => {
    const handler = makeHandler(
      { scope: MessageScope.PRIVATE },
      { mappingType: 'command', trigger: { cmd: 'test' } },
    )
    composite.register(handler)

    expect(composite.getHandler(makeCtx(makePrivateMsgEvent('/test'), MessageScope.PRIVATE))).toBe(
      handler,
    )
    expect(
      composite.getHandler(makeCtx(makeGroupMsgEvent('/test'), MessageScope.GROUP)),
    ).toBeUndefined()
  })

  it('MessageScope.ALL 应匹配所有消息类型', () => {
    const handler = makeHandler(
      { scope: MessageScope.ALL },
      { mappingType: 'command', trigger: { cmd: 'test' } },
    )
    composite.register(handler)

    expect(composite.getHandler(makeCtx(makeGroupMsgEvent('/test'), MessageScope.GROUP))).toBe(
      handler,
    )
    expect(composite.getHandler(makeCtx(makePrivateMsgEvent('/test'), MessageScope.PRIVATE))).toBe(
      handler,
    )
  })

  it('handlerCount 应统计所有已注册处理器', () => {
    composite.register(makeHandler({}, { mappingType: 'command', trigger: { cmd: 'a' } }))
    composite.register(
      makeHandler({}, { mappingType: 'keyword', trigger: { keywords: new Set(['hi']) } }),
    )
    composite.register(
      makeHandler({}, { mappingType: 'event', trigger: { matchConfig: { postType: 'notice' } } }),
    )

    expect(composite.handlerCount).toBe(3)
  })

  it('getAllHandlers 应返回所有匹配的处理器', () => {
    // 命令匹配
    composite.register(makeHandler({}, { mappingType: 'command', trigger: { cmd: 'hi' } }))
    // 关键词匹配（"/hi" 包含 "hi"）
    composite.register(
      makeHandler({}, { mappingType: 'keyword', trigger: { keywords: new Set(['hi']) } }),
    )

    const results = composite.getAllHandlers(makeCtx(makeGroupMsgEvent('/hi')))
    // command 匹配 "/hi"（有前缀），keyword 检查整个文本 "/hi" 是否包含 "hi" → 是
    expect(results.length).toBeGreaterThanOrEqual(1)
  })
})
