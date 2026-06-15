import type { FriendApi, GroupApi, MessageApi } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MessageScope, Permission } from '@/core/dispatch/constants.js'
import type { ContextApis } from '@/core/dispatch/context.js'
import type { InterceptorEntry } from '@/core/dispatch/decorators/symbols.js'
import { EventDispatcher } from '@/core/dispatch/dispatcher.js'
import type { HandlerInterceptor } from '@/core/dispatch/interceptor.js'
import type {
  CompositeHandlerMapping,
  HandlerMethod,
  ResolvedHandler,
} from '@/core/dispatch/mapping.js'

/** 构造最小 ResolvedHandler */
function makeResolved(interceptors: InterceptorEntry[] = []): ResolvedHandler {
  const method: HandlerMethod = {
    instance: {},
    method: vi.fn().mockResolvedValue(undefined),
    priority: 50,
    componentName: 'test',
    meta: {
      mappingType: 'command',
      permission: Permission.ANYONE,
      messageScope: MessageScope.ALL,
      priority: null,
      displayName: '',
      description: '',
    },
    interceptors,
  }
  return { handler: method, regexMatch: null }
}

/** 构造假事件 */
function makeEvent(): AnyOneBotEvent {
  return {
    time: 0,
    self_id: 0,
    post_type: 'message',
    message_type: 'group',
    sub_type: 'normal',
    message_id: 1,
    group_id: 1,
    user_id: 1,
    message: [{ type: 'text', data: { text: '/test' } }],
    raw_message: '/test',
    font: 0,
    sender: { user_id: 1, nickname: 'test', role: 'member' },
  }
}

/** 构造假 mapping，固定返回指定 resolved 列表 */
function makeMapping(resolved: ResolvedHandler[]): CompositeHandlerMapping {
  return {
    register: vi.fn(),
    resolve: vi.fn().mockReturnValue(resolved),
    handlerCount: resolved.length,
  } as unknown as CompositeHandlerMapping
}

/** 构造假 ContextApis */
function makeApis(): ContextApis {
  return {
    msgApi: {} as MessageApi,
    friendApi: {} as unknown as FriendApi,
    groupApi: {} as unknown as GroupApi,
  }
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
    const resolved = makeResolved([{ interceptorClass: InterceptorA }])
    const handlerFn = resolved.handler.method as ReturnType<typeof vi.fn>
    handlerFn.mockImplementation(() => {
      calls.push('handler')
    })

    const dispatcher = new EventDispatcher(makeMapping([resolved]))
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
    const resolved = makeResolved([{ interceptorClass: BlockingInterceptor }])
    const handlerFn = resolved.handler.method as ReturnType<typeof vi.fn>
    handlerFn.mockImplementation(() => {
      calls.push('handler')
    })

    const dispatcher = new EventDispatcher(makeMapping([resolved]))
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
    const resolved = makeResolved([{ interceptorClass: TrackingInterceptor }])
    const handlerFn = resolved.handler.method as ReturnType<typeof vi.fn>
    handlerFn.mockRejectedValue(err)

    const dispatcher = new EventDispatcher(makeMapping([resolved]))
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(calls).not.toContain('post')
    expect(calls).toContain('after')
    expect(capturedError).toBe(err)
  })

  it('class 级拦截器应在 method 级拦截器之前执行', async () => {
    const ClassInterceptor = makeInterceptorClass(calls, 'class')
    const MethodInterceptor = makeInterceptorClass(calls, 'method')
    const resolved = makeResolved([
      { interceptorClass: ClassInterceptor },
      { interceptorClass: MethodInterceptor },
    ])
    const handlerFn = resolved.handler.method as ReturnType<typeof vi.fn>
    handlerFn.mockResolvedValue(undefined)

    const dispatcher = new EventDispatcher(makeMapping([resolved]))
    await dispatcher.dispatch(makeEvent(), makeApis())

    const preIdx = (name: string) => calls.indexOf(`${name}:pre`)
    expect(preIdx('class')).toBeLessThan(preIdx('method'))
  })

  it('无声明式拦截器时 handler 应正常执行', async () => {
    const resolved = makeResolved([])
    const handlerFn = resolved.handler.method as ReturnType<typeof vi.fn>
    handlerFn.mockResolvedValue(undefined)

    const dispatcher = new EventDispatcher(makeMapping([resolved]))
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(handlerFn).toHaveBeenCalledOnce()
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
    const resolved = makeResolved([{ interceptorClass: BlockingDecl }])
    const handlerFn = resolved.handler.method as ReturnType<typeof vi.fn>
    handlerFn.mockImplementation(() => {
      calls.push('handler')
    })

    const globalInterceptorInstance = new GlobalInterceptor()
    const dispatcher = new EventDispatcher(makeMapping([resolved]), [globalInterceptorInstance])
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
    const resolved = makeResolved([{ interceptorClass: DeclInterceptor }])
    const handlerFn = resolved.handler.method as ReturnType<typeof vi.fn>
    handlerFn.mockImplementation(() => {
      calls.push('handler')
    })

    const dispatcher = new EventDispatcher(makeMapping([resolved]), [new GlobalInterceptor()])
    await dispatcher.dispatch(makeEvent(), makeApis())

    expect(calls).toEqual(['G:pre', 'D:pre', 'handler', 'D:post', 'G:post', 'G:after', 'D:after'])
  })
})
