// tests/unit/core/tasks/executor.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { RedisStore } from '@/core/redis/index.js'

/* BullMQ mock 工厂（每个 test 独立实例化，避免 .mock.results 下标竞争） */

type EventListener = (data: unknown) => void

interface MockQueueEvents {
  on: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  emit: (event: string, data: unknown) => void
}

function createMockQueueEvents(): MockQueueEvents {
  const listeners: Record<string, EventListener[]> = {}
  return {
    on: vi.fn((event: string, cb: EventListener) => {
      listeners[event] ??= []
      listeners[event].push(cb)
    }),
    close: vi.fn().mockResolvedValue(undefined),
    emit: (event: string, data: unknown) => {
      listeners[event]?.forEach((cb) => {
        cb(data)
      })
    },
  }
}

vi.mock('bullmq', () => ({
  QueueEvents: vi.fn(),
  Queue: vi.fn().mockImplementation(function () {
    return {}
  }),
  Job: { fromId: vi.fn() },
}))

function createMockCache() {
  return {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisStore
}

/**
 * 全部 Bot API 调用改走 MessageRouter（不再区分 master/normal 专属通道），
 * 默认 mock 为发送成功，个别用例可覆写为 reject 模拟"无可用账号"。
 */
function createMockRouter() {
  return {
    sendGroupMsg: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 1 } }),
    sendPrivateMsg: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 1 } }),
    sendGroupSign: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    sendLike: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    setPriorityMode: vi.fn(),
    sendAdminMsg: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 1 } }),
  } as unknown as MessageRouter
}

describe('TaskExecutor', () => {
  let mockEvents: MockQueueEvents

  beforeEach(async () => {
    mockEvents = createMockQueueEvents()
    const captured = mockEvents
    const { QueueEvents } = await import('bullmq')
    ;(QueueEvents as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return captured
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('self-contained 结果不调用 BotAPI', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'test-job' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockRouter = createMockRouter()
    const executor = new TaskExecutor(createMockCache(), mockRouter, {}, 'aemeath-tasks')
    executor.start()

    mockEvents.emit('completed', {
      jobId: '1',
      returnvalue: { type: 'self-contained', summary: { rows: 0 } },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockRouter.sendGroupSign).not.toHaveBeenCalled()
  })

  it('白名单内方法正常调用', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'like' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockRouter = createMockRouter()
    const executor = new TaskExecutor(createMockCache(), mockRouter, {}, 'aemeath-tasks')
    executor.start()

    mockEvents.emit('completed', {
      jobId: '3',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'sendLike', args: ['111', 10] }],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockRouter.sendLike).toHaveBeenCalledWith('111', 10)
  })

  it('白名单外方法被拒绝', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'evil' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockRouter = createMockRouter()
    const executor = new TaskExecutor(createMockCache(), mockRouter, {}, 'aemeath-tasks')
    executor.start()

    mockEvents.emit('completed', {
      jobId: '4',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'deleteMsg', args: ['999'] }],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect((mockRouter as unknown as Record<string, unknown>).deleteMsg).toBeUndefined()
    expect(mockRouter.sendGroupSign).not.toHaveBeenCalled()
  })

  it('sendGroupSign 成功后通过 postCacheOps 写入打卡去重键', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'checkin' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockRouter = createMockRouter()
    const cache = createMockCache()
    const executor = new TaskExecutor(cache, mockRouter, {}, 'aemeath-tasks')
    executor.start()

    mockEvents.emit('completed', {
      jobId: '5',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'sendGroupSign', args: ['300'] }],
        postCacheOps: [
          { action: 'set', key: 'aemeath:checkin:300:2024-01-01', value: '1', ttl: 90_000 },
        ],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockRouter.sendGroupSign).toHaveBeenCalledWith('300')
    expect(cache.set).toHaveBeenCalledOnce()
    // 验证 cache.set 的第三个参数是 TTL（90000）
    expect((cache.set as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toBe(90_000)
  })

  it('Router 抛出"无可用账号"异常时记录 error，不向上抛出', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'checkin' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockRouter = createMockRouter()
    ;(mockRouter.sendGroupSign as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('当前群无可用账号发送消息'),
    )
    const executor = new TaskExecutor(createMockCache(), mockRouter, {}, 'aemeath-tasks')
    executor.start()

    mockEvents.emit('completed', {
      jobId: '6',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'sendGroupSign', args: ['300'] }],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockRouter.sendGroupSign).toHaveBeenCalledOnce()
    // 不抛出未处理异常即视为通过（vitest 若有 unhandled rejection 会使测试失败）
  })
})
