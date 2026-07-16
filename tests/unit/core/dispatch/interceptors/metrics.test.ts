import type { ResolvedHandler } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/core/monitoring/index.js', () => ({
  eventProcessed: { inc: vi.fn() },
  eventProcessingSeconds: { observe: vi.fn() },
  eventErrors: { inc: vi.fn() },
}))

function makeHandler(): ResolvedHandler {
  return {
    instance: {},
    methodName: 'handle',
    handlerName: 'echo',
    priority: 0,
    requiredBotCapability: null,
  }
}

function makeCtx(postType = 'message') {
  const attrs = new Map<string, unknown>()
  return {
    event: { postType },
    setAttribute: (k: string, v: unknown) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k),
  }
}

describe('MetricsInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preHandle 记录开始时间并返回 true', async () => {
    const { MetricsInterceptor } = await import('@/core/dispatch/interceptors/metrics.js')
    const interceptor = new MetricsInterceptor()
    const ctx = makeCtx()

    const result = await interceptor.preHandle(ctx as never, makeHandler())

    expect(result).toBe(true)
  })

  it('postHandle 按 event_type + handler 名递增 eventProcessed 计数器', async () => {
    const { MetricsInterceptor } = await import('@/core/dispatch/interceptors/metrics.js')
    const { eventProcessed } = await import('@/core/monitoring/index.js')
    const interceptor = new MetricsInterceptor()
    const ctx = makeCtx('message')

    await interceptor.postHandle(ctx as never, makeHandler())

    expect(eventProcessed.inc).toHaveBeenCalledWith({ event_type: 'message', handler: 'echo' })
  })

  it('afterCompletion 记录耗时直方图，无 error 时不递增 eventErrors', async () => {
    const { MetricsInterceptor } = await import('@/core/dispatch/interceptors/metrics.js')
    const { eventProcessingSeconds, eventErrors } = await import('@/core/monitoring/index.js')
    const interceptor = new MetricsInterceptor()
    const ctx = makeCtx()

    await interceptor.preHandle(ctx as never, makeHandler())
    await interceptor.afterCompletion(ctx as never, makeHandler(), undefined)

    expect(eventProcessingSeconds.observe).toHaveBeenCalledWith(expect.any(Number))
    expect(eventErrors.inc).not.toHaveBeenCalled()
  })

  it('afterCompletion 有 error 时递增 eventErrors', async () => {
    const { MetricsInterceptor } = await import('@/core/dispatch/interceptors/metrics.js')
    const { eventErrors } = await import('@/core/monitoring/index.js')
    const interceptor = new MetricsInterceptor()
    const ctx = makeCtx()

    await interceptor.preHandle(ctx as never, makeHandler())
    await interceptor.afterCompletion(ctx as never, makeHandler(), new Error('boom'))

    expect(eventErrors.inc).toHaveBeenCalledTimes(1)
  })

  it('afterCompletion 在没有 preHandle 记录开始时间的情况下不抛异常也不记录耗时', async () => {
    const { MetricsInterceptor } = await import('@/core/dispatch/interceptors/metrics.js')
    const { eventProcessingSeconds } = await import('@/core/monitoring/index.js')
    const interceptor = new MetricsInterceptor()
    const ctx = makeCtx()

    await expect(
      interceptor.afterCompletion(ctx as never, makeHandler(), undefined),
    ).resolves.toBeUndefined()
    expect(eventProcessingSeconds.observe).not.toHaveBeenCalled()
  })
})
