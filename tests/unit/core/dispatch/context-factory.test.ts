import { EventDispatcher } from '@aemeath-projects/exostrider/dispatch'
import type { HandlerMapping, HandlerMethod } from '@aemeath-projects/exostrider/dispatch'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import { describe, it, expect, vi } from 'vitest'

import { OneBotContext, oneBotContextConfig } from '../../../../src/core/dispatch/index.js'
import type { ContextApis } from '../../../../src/core/dispatch/index.js'

// 回归测试：EventDispatcher 默认只会构造 exostrider 内置的 Context 基类，OneBotContext
// 追加的 groupId/userId/reply() 等成员不会生效。main.ts 必须显式传入 contextFactory，
// dispatch() 才会真正构造 OneBotContext 实例——否则所有依赖 ctx.groupId 判空或
// ctx.reply() 发送消息的 handler（jrlp/checkin/feedback/drift-bottle 等）会完全无响应，
// 且不会有任何报错或日志（因为 base Context.reply() 在未配置 replyHandler 时是纯粹的
// no-op，ctx.groupId 在 base Context 上不存在，直接返回 undefined）。

function makeGroupEvent(text: string): AnyOneBotEvent {
  return {
    time: 0,
    selfId: 1,
    postType: 'message',
    messageType: 'group',
    subType: 'normal',
    messageId: 42,
    groupId: 111,
    userId: 222,
    message: [{ type: 'text', data: { text } }],
    rawMessage: text,
    font: 0,
    sender: { userId: 222, nickname: 'test', role: 'member' },
  }
}

function makeHandlerMethod(fn: (ctx: OneBotContext) => Promise<void> | void): HandlerMethod {
  return {
    instance: { handle: fn },
    methodName: 'handle',
    handlerName: 'test',
    priority: 50,
    scope: 'group',
    permission: 0,
    mappingType: 'fullmatch',
    trigger: { text: 'jrlp' },
    interceptors: [],
    requiredBotCapability: null,
  }
}

describe('main.ts 的 contextFactory 接入（回归）', () => {
  it('dispatch() 构造的 ctx 是 OneBotContext 实例，groupId 正确解析', async () => {
    let captured: OneBotContext | undefined
    const handlerMethod = makeHandlerMethod((ctx) => {
      captured = ctx
    })
    const mapping: HandlerMapping<AnyOneBotEvent, ContextApis> = {
      priority: 0,
      getHandler: () => handlerMethod,
    }

    const dispatcher = new EventDispatcher<AnyOneBotEvent, ContextApis>({
      mapping,
      contextConfig: oneBotContextConfig,
      contextFactory: (event, apis, config) => new OneBotContext(event, apis, config),
    })

    await dispatcher.dispatch(makeGroupEvent('jrlp'), {
      msgApi: {},
      groupApi: {},
      friendApi: {},
    } as unknown as ContextApis)

    expect(captured).toBeInstanceOf(OneBotContext)
    expect(captured?.groupId).toBe('111')
    expect(captured?.userId).toBe('222')
  })

  it('ctx.reply() 通过 msgApi.sendGroupMsg 真正发送消息（而非 no-op）', async () => {
    const sendGroupMsg = vi.fn().mockResolvedValue({ ok: true, data: { messageId: 1 } })
    const handlerMethod = makeHandlerMethod(async (ctx) => {
      await ctx.reply('抽取失败，请稍后重试')
    })
    const mapping: HandlerMapping<AnyOneBotEvent, ContextApis> = {
      priority: 0,
      getHandler: () => handlerMethod,
    }

    const dispatcher = new EventDispatcher<AnyOneBotEvent, ContextApis>({
      mapping,
      contextConfig: oneBotContextConfig,
      contextFactory: (event, apis, config) => new OneBotContext(event, apis, config),
    })

    await dispatcher.dispatch(makeGroupEvent('jrlp'), {
      msgApi: { sendGroupMsg },
      groupApi: {},
      friendApi: {},
    } as unknown as ContextApis)

    expect(sendGroupMsg).toHaveBeenCalledWith(111, [
      { type: 'text', data: { text: '抽取失败，请稍后重试' } },
    ])
  })

  it('未配置 contextFactory 时 ctx.groupId 恒为 undefined、ctx.reply() 是 no-op（说明该配置项必不可少）', async () => {
    const sendGroupMsg = vi.fn()
    let groupIdSeen: unknown
    const handlerMethod = makeHandlerMethod(async (ctx) => {
      // 注意：这里的 ctx 类型标注是 OneBotContext，但如果 dispatcher 没有配置
      // contextFactory，运行时实际拿到的是 exostrider 内置的 Context 基类实例，
      // 类型标注无法反映这一点——这正是该 bug 的隐蔽之处。
      groupIdSeen = (ctx as unknown as { groupId?: unknown }).groupId
      await ctx.reply('不应该真正发送')
    })
    const mapping: HandlerMapping<AnyOneBotEvent, ContextApis> = {
      priority: 0,
      getHandler: () => handlerMethod,
    }

    const dispatcher = new EventDispatcher<AnyOneBotEvent, ContextApis>({
      mapping,
      contextConfig: oneBotContextConfig,
      // 故意不传 contextFactory，复现修复前的行为
    })

    await dispatcher.dispatch(makeGroupEvent('jrlp'), {
      msgApi: { sendGroupMsg },
      groupApi: {},
      friendApi: {},
    } as unknown as ContextApis)

    expect(groupIdSeen).toBeUndefined()
    expect(sendGroupMsg).not.toHaveBeenCalled()
  })
})
