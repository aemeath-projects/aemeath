import { describe, it, expect, vi } from 'vitest'

const { runWithTraceMock } = vi.hoisted(() => ({
  runWithTraceMock: vi.fn((_traceId: string, fn: () => void) => {
    fn()
  }),
}))

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  runWithTrace: runWithTraceMock,
}))

const { createBotEventHandler } = await import('@/core/bot-event-handler.js')

describe('createBotEventHandler', () => {
  it('用 runWithTrace 包裹 dispatch 调用，并传入随机生成的 traceId', () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    const dispatcher = { dispatch }
    const router = {}
    const pool = {}
    const errorMock = vi.fn()
    const log = { error: errorMock }
    const buildContextApis = vi.fn().mockReturnValue({ apis: 'fake' })

    const handler = createBotEventHandler(
      dispatcher as never,
      router as never,
      pool as never,
      log as never,
      buildContextApis as never,
    )

    const aggregated = { event: { postType: 'message' } }
    handler(aggregated as never)

    expect(runWithTraceMock).toHaveBeenCalledOnce()
    const [traceIdArg] = runWithTraceMock.mock.calls[0] as [string, () => void]
    expect(typeof traceIdArg).toBe('string')
    expect(traceIdArg.length).toBeGreaterThan(0)
    expect(dispatch).toHaveBeenCalledWith(aggregated.event, { apis: 'fake' })
  })

  it('dispatch 拒绝时应当被捕获并记录 error 日志，不向上抛出（不产生 unhandledRejection）', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('handler 内部异常'))
    const dispatcher = { dispatch }
    const errorMock = vi.fn()
    const log = { error: errorMock }
    const buildContextApis = vi.fn().mockReturnValue({})

    const handler = createBotEventHandler(
      dispatcher as never,
      {} as never,
      {} as never,
      log as never,
      buildContextApis as never,
    )

    handler({ event: { postType: 'message' } } as never)

    // dispatch() 的 rejection 是异步的，等待微任务队列排空
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))

    expect(errorMock).toHaveBeenCalledWith({ err: expect.any(Error) }, '事件分发未捕获异常')
  })

  it('buildContextApis 同步抛出异常时应当被捕获并记录 error 日志，不向上抛出', () => {
    const dispatch = vi.fn().mockResolvedValue(undefined)
    const dispatcher = { dispatch }
    const errorMock = vi.fn()
    const log = { error: errorMock }
    const buildContextApis = vi.fn(() => {
      throw new Error('账号客户端解析失败')
    })

    const handler = createBotEventHandler(
      dispatcher as never,
      {} as never,
      {} as never,
      log as never,
      buildContextApis,
    )

    expect(() => {
      handler({ event: { postType: 'message' } } as never)
    }).not.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
    expect(errorMock).toHaveBeenCalledWith({ err: expect.any(Error) }, '事件分发未捕获异常')
  })
})
