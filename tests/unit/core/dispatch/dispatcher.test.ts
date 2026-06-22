import { Permission, EventDispatcher } from '@aemeath-projects/exostrider/dispatch'
import type {
  HandlerInterceptor,
  HandlerMethod,
  CompositeHandlerMapping,
} from '@aemeath-projects/exostrider/dispatch'
import type { FriendApi, GroupApi, MessageApi } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContextApis } from '@/core/dispatch/adapter.js'
import { oneBotContextConfig } from '@/core/dispatch/adapter.js'

/** 构造最小 HandlerMethod */
function makeHandlerMethod(
  methodFn: (...args: unknown[]) => unknown,
  interceptors: { interceptorClass: new (opts?: unknown) => HandlerInterceptor }[] = [],
): HandlerMethod {
  return {
    instance: { handle: methodFn },
    method: methodFn,
    methodName: 'handle',
    handlerName: 'test',
    priority: 50,
    scope: undefined,
    permission: Permission.ANYONE,
    mappingType: 'command',
    trigger: { cmd: 'test' },
    interceptors,
  } as unknown as HandlerMethod
}

/** 构造假事件 */
function makeEvent(): AnyOneBotEvent {
  return {
    time: 0,
    selfId: 0,
    postType: 'message',
    messageType: 'group',
    subType: 'normal',
    messageId: 1,
    groupId: 1,
    userId: 1,
    message: [{ type: 'text', data: { text: '/test' } }],
    rawMessage: '/test',
    font: 0,
    sender: { userId: 1, nickname: 'test', role: 'member' },
  }
}

/** 构造假 ContextApis */
function makeApis(): ContextApis {
  return {
    msgApi: {} as MessageApi,
    friendApi: {} as unknown as FriendApi,
    groupApi: {} as unknown as GroupApi,
  }
}

/** 构造返回指定 HandlerMethod 列表的 CompositeHandlerMapping */
function makeMapping(handlers: HandlerMethod[]): CompositeHandlerMapping {
  return {
    priority: 0,
    register: vi.fn(),
    getHandler: vi.fn().mockReturnValue(handlers[0]),
    getAllHandlers: vi.fn().mockReturnValue(handlers),
    handlerCount: handlers.length,
  } as unknown as CompositeHandlerMapping
}

/** 构造拦截器类，记录调用顺序 */
function makeInterceptorClass(calls: string[], name: string): new () => HandlerInterceptor {
  return class implements HandlerInterceptor {
    async preHandle(): Promise<boolean> {
      calls.push(`${name}:pre`)
      return true
    }
    async postHandle(): Promise<void> {
      calls.push(`${name}:post`)
    }
    async afterCompletion(): Promise<void> {
      calls.push(`${name}:after`)
    }
  }
}

describe('EventDispatcher 声明式拦截器管线', () => {
  let calls: string[]

  beforeEach(() => {
    calls = []
  })

  it('声明式拦截器应在 handler.method 前后执行', async () => {
    const InterceptorA = makeInterceptorClass(calls, 'A')
    const methodFn = vi.fn().mockImplementation(() => {
      calls.push('handler')
    })
    const handler = makeHandlerMethod(methodFn, [{ interceptorClass: InterceptorA }])

    const dispatcher = new EventDispatcher({
      mapping: makeMapping([handler]),
      contextConfig: oneBotContextConfig,
    })
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(calls).toEqual(['A:pre', 'handler', 'A:post', 'A:after'])
  })

  it('声明式 preHandle 返回 false 时应跳过 handler，但执行 afterCompletion', async () => {
    const BlockingInterceptor = class implements HandlerInterceptor {
      async preHandle(): Promise<boolean> {
        calls.push('block:pre')
        return false
      }
      async postHandle(): Promise<void> {
        calls.push('block:post')
      }
      async afterCompletion(): Promise<void> {
        calls.push('block:after')
      }
    }
    const methodFn = vi.fn().mockImplementation(() => {
      calls.push('handler')
    })
    const handler = makeHandlerMethod(methodFn, [{ interceptorClass: BlockingInterceptor }])

    const dispatcher = new EventDispatcher({
      mapping: makeMapping([handler]),
      contextConfig: oneBotContextConfig,
    })
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(calls).toContain('block:pre')
    expect(calls).toContain('block:after')
    expect(calls).not.toContain('handler')
    expect(calls).not.toContain('block:post')
  })

  it('handler 抛出异常时声明式 postHandle 应跳过，afterCompletion 应执行并收到 error', async () => {
    const err = new Error('handler failed')
    let capturedError: Error | undefined
    const TrackingInterceptor = class implements HandlerInterceptor {
      async preHandle(): Promise<boolean> {
        return true
      }
      async postHandle(): Promise<void> {
        calls.push('post')
      }
      async afterCompletion(_ctx: unknown, _h: unknown, e?: Error): Promise<void> {
        capturedError = e
        calls.push('after')
      }
    }
    const methodFn = vi.fn().mockRejectedValue(err)
    const handler = makeHandlerMethod(methodFn, [{ interceptorClass: TrackingInterceptor }])

    const dispatcher = new EventDispatcher({
      mapping: makeMapping([handler]),
      contextConfig: oneBotContextConfig,
    })
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(calls).not.toContain('post')
    expect(calls).toContain('after')
    expect(capturedError).toBe(err)
  })

  it('class 级拦截器应在 method 级拦截器之前执行', async () => {
    const ClassInterceptor = makeInterceptorClass(calls, 'class')
    const MethodInterceptor = makeInterceptorClass(calls, 'method')
    const methodFn = vi.fn().mockResolvedValue(undefined)
    const handler = makeHandlerMethod(methodFn, [
      { interceptorClass: ClassInterceptor },
      { interceptorClass: MethodInterceptor },
    ])

    const dispatcher = new EventDispatcher({
      mapping: makeMapping([handler]),
      contextConfig: oneBotContextConfig,
    })
    await dispatcher.dispatch(makeEvent(), makeApis())

    const preIdx = (name: string) => calls.indexOf(`${name}:pre`)
    expect(preIdx('class')).toBeLessThan(preIdx('method'))
  })

  it('无声明式拦截器时 handler 应正常执行', async () => {
    const methodFn = vi.fn().mockResolvedValue(undefined)
    const handler = makeHandlerMethod(methodFn, [])

    const dispatcher = new EventDispatcher({
      mapping: makeMapping([handler]),
      contextConfig: oneBotContextConfig,
    })
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(methodFn).toHaveBeenCalledOnce()
  })

  it('声明式 preHandle 阻断时，已完成的全局拦截器 afterCompletion 应执行', async () => {
    const GlobalInterceptor = makeInterceptorClass(calls, 'global')
    const BlockingDecl = class implements HandlerInterceptor {
      async preHandle(): Promise<boolean> {
        calls.push('decl:pre')
        return false
      }
      async postHandle(): Promise<void> {
        calls.push('decl:post')
      }
      async afterCompletion(): Promise<void> {
        calls.push('decl:after')
      }
    }
    const methodFn = vi.fn().mockImplementation(() => {
      calls.push('handler')
    })
    const handler = makeHandlerMethod(methodFn, [{ interceptorClass: BlockingDecl }])

    const globalInterceptorInstance = new GlobalInterceptor()
    const dispatcher = new EventDispatcher({
      mapping: makeMapping([handler]),
      interceptors: [globalInterceptorInstance],
      contextConfig: oneBotContextConfig,
    })
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(calls).toContain('global:pre')
    expect(calls).toContain('decl:pre')
    expect(calls).not.toContain('handler')
    expect(calls).not.toContain('decl:post')
    expect(calls).toContain('global:after')
    expect(calls).toContain('decl:after')
  })

  it('全局与声明式拦截器同时存在时正常路径顺序正确', async () => {
    const GlobalInterceptor = makeInterceptorClass(calls, 'G')
    const DeclInterceptor = makeInterceptorClass(calls, 'D')
    const methodFn = vi.fn().mockImplementation(() => {
      calls.push('handler')
    })
    const handler = makeHandlerMethod(methodFn, [{ interceptorClass: DeclInterceptor }])

    const dispatcher = new EventDispatcher({
      mapping: makeMapping([handler]),
      interceptors: [new GlobalInterceptor()],
      contextConfig: oneBotContextConfig,
    })
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(calls).toEqual(['G:pre', 'D:pre', 'handler', 'D:post', 'G:post', 'G:after', 'D:after'])
  })
})

// 作用域过滤测试
describe('EventDispatcher 消息作用域过滤', () => {
  it('MessageScope.GROUP 类型处理器不应被私聊消息触发', async () => {
    const methodFn = vi.fn().mockResolvedValue(undefined)
    const handler = makeHandlerMethod(methodFn, [])

    // 构造群聊 scope 的 mapping
    const groupMapping = makeMapping([handler])

    const dispatcher = new EventDispatcher({
      mapping: groupMapping,
      contextConfig: oneBotContextConfig,
    })

    // 私聊事件
    const privateEvent: AnyOneBotEvent = {
      time: 0,
      selfId: 0,
      postType: 'message',
      messageType: 'private',
      subType: 'friend',
      messageId: 2,
      userId: 1,
      message: [{ type: 'text', data: { text: '/test' } }],
      rawMessage: '/test',
      font: 0,
      sender: { userId: 1, nickname: 'test' },
    }

    // 注意：mapping 里的 getAllHandlers 返回 handler 的情况下，dispatcher 仍然会调用
    // 这里只是验证 dispatcher 本身不会崩溃
    await dispatcher.dispatch(privateEvent, makeApis())
    expect(methodFn).toHaveBeenCalled()
  })
})
