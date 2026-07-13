import type { ResolvedHandler } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { SessionInterceptor } from '@/core/dispatch/interceptors/session.js'

function makeHandler(): ResolvedHandler {
  return {
    instance: {},
    methodName: 'handle',
    handlerName: 'echo',
    priority: 0,
    requiredBotCapability: null,
  }
}

function makeCtx(postType: string, userId: string, groupId: string | undefined, text: string) {
  return {
    event: { postType },
    userId,
    groupId,
    getPlaintext: () => text,
  }
}

describe('SessionInterceptor', () => {
  let interceptor: SessionInterceptor

  beforeEach(() => {
    interceptor = new SessionInterceptor()
  })

  it('未注入 SessionManager 时直通返回 true', async () => {
    const ctx = makeCtx('message', '1', undefined, '/help')
    const result = await interceptor.preHandle(ctx as never, makeHandler())
    expect(result).toBe(true)
  })

  it('非 message 事件直通返回 true', async () => {
    const manager = {
      isActive: vi.fn().mockReturnValue(true),
      processMessage: vi.fn(),
      cancel: vi.fn(),
    }
    interceptor.setSessionManager(manager as never)
    const ctx = makeCtx('notice', '1', undefined, '')

    const result = await interceptor.preHandle(ctx as never, makeHandler())

    expect(result).toBe(true)
    expect(manager.isActive).not.toHaveBeenCalled()
  })

  it('无活跃会话时放行给常规 handler', async () => {
    const manager = {
      isActive: vi.fn().mockReturnValue(false),
      processMessage: vi.fn(),
      cancel: vi.fn(),
    }
    interceptor.setSessionManager(manager as never)
    const ctx = makeCtx('message', '1', '100', '普通消息')

    const result = await interceptor.preHandle(ctx as never, makeHandler())

    expect(result).toBe(true)
    expect(manager.processMessage).not.toHaveBeenCalled()
  })

  it('有活跃会话时路由消息到会话状态机并阻断后续 handler', async () => {
    const manager = {
      isActive: vi.fn().mockReturnValue(true),
      processMessage: vi.fn(),
      cancel: vi.fn(),
    }
    interceptor.setSessionManager(manager as never)
    const ctx = makeCtx('message', '1', '100', '会话中的回答')

    const result = await interceptor.preHandle(ctx as never, makeHandler())

    expect(result).toBe(false)
    expect(manager.processMessage).toHaveBeenCalledWith(ctx, '会话中的回答')
  })

  it('取消命令终止活跃会话', async () => {
    const manager = {
      isActive: vi.fn().mockReturnValue(true),
      processMessage: vi.fn(),
      cancel: vi.fn(),
    }
    interceptor.setSessionManager(manager as never)
    const ctx = makeCtx('message', '1', '100', '/取消')

    const result = await interceptor.preHandle(ctx as never, makeHandler())

    expect(result).toBe(false)
    expect(manager.cancel).toHaveBeenCalledOnce()
    expect(manager.processMessage).not.toHaveBeenCalled()
  })
})
