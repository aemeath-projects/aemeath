import type { ResolvedHandler } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect, vi } from 'vitest'

const debugMock = vi.fn()
const errorMock = vi.fn()

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  getLogger: () => ({ debug: debugMock, error: errorMock }),
}))

const { LoggingInterceptor } =
  await import('../../../../../src/core/dispatch/interceptors/logging.js')

function makeCtx() {
  const attrs = new Map<string, unknown>()
  return {
    event: { postType: 'message' },
    userId: '1',
    groupId: undefined,
    setAttribute: (k: string, v: unknown) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k),
  }
}

function makeHandler(): ResolvedHandler {
  return {
    instance: {},
    methodName: 'handle',
    handlerName: 'echo',
    priority: 0,
    requiredBotCapability: null,
  }
}

describe('LoggingInterceptor', () => {
  it('preHandle 记录开始时间并输出 debug 日志', async () => {
    debugMock.mockClear()
    const interceptor = new LoggingInterceptor()
    const ctx = makeCtx()

    const result = await interceptor.preHandle(ctx as never, makeHandler())

    expect(result).toBe(true)
    expect(ctx.getAttribute('_logging_start_time')).toEqual(expect.any(Number))
    expect(debugMock).toHaveBeenCalledOnce()
  })

  it('afterCompletion 无错误时输出 debug 日志', async () => {
    debugMock.mockClear()
    errorMock.mockClear()
    const interceptor = new LoggingInterceptor()
    const ctx = makeCtx()
    await interceptor.preHandle(ctx as never, makeHandler())

    await interceptor.afterCompletion(ctx as never, makeHandler(), undefined)

    expect(debugMock).toHaveBeenCalledTimes(2)
    expect(errorMock).not.toHaveBeenCalled()
  })

  it('afterCompletion 有错误时输出结构化 error 日志（保留完整 err 对象，不丢失 stack）', async () => {
    debugMock.mockClear()
    errorMock.mockClear()
    const interceptor = new LoggingInterceptor()
    const ctx = makeCtx()
    await interceptor.preHandle(ctx as never, makeHandler())

    const error = new Error('boom')
    await interceptor.afterCompletion(ctx as never, makeHandler(), error)

    expect(errorMock).toHaveBeenCalledOnce()
    expect(errorMock).toHaveBeenCalledWith(
      { err: error, handler: 'echo.handle', durationMs: expect.any(Number) },
      'Handler 执行异常',
    )
  })
})
