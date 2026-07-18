import { describe, it, expect, vi, afterEach } from 'vitest'

import { registerProcessErrorHandlers } from '@/core/process-handlers.js'

describe('registerProcessErrorHandlers', () => {
  afterEach(() => {
    process.removeAllListeners('uncaughtException')
    process.removeAllListeners('unhandledRejection')
  })

  it('注册 uncaughtException 处理器：记录 fatal 日志并调用 process.exit(1)', () => {
    const fatalMock = vi.fn()
    const errorMock = vi.fn()
    const logger = { fatal: fatalMock, error: errorMock } as never
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    registerProcessErrorHandlers(logger)
    const err = new Error('boom')
    process.emit('uncaughtException', err)

    expect(fatalMock).toHaveBeenCalledWith({ err }, '未捕获异常，进程即将退出')
    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
  })

  it('注册 unhandledRejection 处理器：仅记录 error 日志，不调用 process.exit', () => {
    const fatalMock = vi.fn()
    const errorMock = vi.fn()
    const logger = { fatal: fatalMock, error: errorMock } as never
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    registerProcessErrorHandlers(logger)
    const reason = new Error('未处理的拒绝')
    process.emit('unhandledRejection', reason, Promise.resolve())

    expect(errorMock).toHaveBeenCalledWith({ err: reason }, '未处理的 Promise rejection')
    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
  })
})
