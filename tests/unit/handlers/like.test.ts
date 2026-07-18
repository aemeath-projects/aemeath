import { handlerRegistry } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { errorMock } = vi.hoisted(() => ({ errorMock: vi.fn() }))

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  getLogger: () => ({ error: errorMock, debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

const { LikeHandler } = await import('@/handlers/like.js')

interface MockLikeService {
  sendLikeNow: ReturnType<typeof vi.fn>
  registerTask: ReturnType<typeof vi.fn>
  cancelTask: ReturnType<typeof vi.fn>
  getStatus: ReturnType<typeof vi.fn>
}

function makeCtx(args: string[]) {
  const replySpy = vi.fn().mockResolvedValue(undefined)
  return {
    userId: '10000',
    groupId: '20000',
    getArgs: () => args,
    reply: replySpy,
  }
}

function makeHandler(svc: MockLikeService) {
  const handler = new LikeHandler()
  ;(handler as unknown as { likeService: MockLikeService }).likeService = svc
  return handler
}

describe('LikeHandler 异常保护', () => {
  beforeEach(() => {
    errorMock.mockClear()
    handlerRegistry.clear()
  })

  it('schedule 子命令：registerTask 抛异常时应回复失败提示并记录日志，不让异常冒泡', async () => {
    const svc: MockLikeService = {
      sendLikeNow: vi.fn(),
      registerTask: vi.fn().mockRejectedValue(new Error('数据库连接失败')),
      cancelTask: vi.fn(),
      getStatus: vi.fn(),
    }
    const handler = makeHandler(svc)
    const ctx = makeCtx(['schedule'])

    await expect(handler.handle(ctx as never)).resolves.toBeUndefined()
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('失败'))
    expect(errorMock).toHaveBeenCalledOnce()
  })

  it('cancel 子命令：cancelTask 抛异常时应回复失败提示并记录日志', async () => {
    const svc: MockLikeService = {
      sendLikeNow: vi.fn(),
      registerTask: vi.fn(),
      cancelTask: vi.fn().mockRejectedValue(new Error('数据库连接失败')),
      getStatus: vi.fn(),
    }
    const handler = makeHandler(svc)
    const ctx = makeCtx(['cancel'])

    await expect(handler.handle(ctx as never)).resolves.toBeUndefined()
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('失败'))
    expect(errorMock).toHaveBeenCalledOnce()
  })

  it('status 子命令：getStatus 抛异常时应回复失败提示并记录日志', async () => {
    const svc: MockLikeService = {
      sendLikeNow: vi.fn(),
      registerTask: vi.fn(),
      cancelTask: vi.fn(),
      getStatus: vi.fn().mockRejectedValue(new Error('数据库连接失败')),
    }
    const handler = makeHandler(svc)
    const ctx = makeCtx(['status'])

    await expect(handler.handle(ctx as never)).resolves.toBeUndefined()
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('失败'))
    expect(errorMock).toHaveBeenCalledOnce()
  })

  it('schedule 子命令：正常路径不受影响，仍能注册成功', async () => {
    const svc: MockLikeService = {
      sendLikeNow: vi.fn(),
      registerTask: vi.fn().mockResolvedValue({ alreadyExists: false }),
      cancelTask: vi.fn(),
      getStatus: vi.fn(),
    }
    const handler = makeHandler(svc)
    const ctx = makeCtx(['schedule'])

    await handler.handle(ctx as never)

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('已注册'))
    expect(errorMock).not.toHaveBeenCalled()
  })
})
