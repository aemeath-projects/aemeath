// tests/unit/core/tasks/executor.test.ts
import type { ClientPool } from '@aemeath-projects/exostrider/pool'
import type { FriendApi, GroupApi, MessageApi } from '@aemeath-projects/napcat'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { RedisStore } from '@/core/redis/index.js'
import type { RenderSendJobResult } from '@/core/tasks/index.js'

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

function createMockMsgApi() {
  return {
    sendGroupMsg: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
    sendPrivateMsg: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
    deleteMsg: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
  } as unknown as MessageApi
}

function createMockFriendApi() {
  return {
    sendLike: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
  } as unknown as FriendApi
}

function createMockGroupApi() {
  return {
    sendGroupSign: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
  } as unknown as GroupApi
}

/**
 * `hasMasterClients` 默认跟随 `hasClients`，保持既有用例（不区分角色）行为不变；
 * 传入不同值时可以模拟"有非 master 账号在线，但 master 不在线"这种场景。
 */
function createMockPool(hasClients = true, hasMasterClients = hasClients) {
  return {
    getAvailableClients: vi.fn((role?: string) => {
      if (role === 'master') return hasMasterClients ? [{}] : []
      return hasClients ? [{}] : []
    }),
  } as unknown as ClientPool<never, string, unknown>
}

function createMockCache() {
  return {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisStore
}

/**
 * render-send 走 MessageRouter 发送（不再要求 master 专属通道），
 * 默认 mock 为发送成功，个别用例可覆写为 reject 模拟"全账号离线"。
 */
function createMockRouter() {
  return {
    sendGroupMsg: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 1 } }),
    sendPrivateMsg: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 1 } }),
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
    const mockGroupApi = createMockGroupApi()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      mockGroupApi,
      createMockPool(),
      createMockCache(),
      createMockRouter(),
      {},
      'aemeath-tasks',
    )
    executor.start()

    mockEvents.emit('completed', {
      jobId: '1',
      returnvalue: { type: 'self-contained', summary: { rows: 0 } },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockGroupApi.sendGroupSign).not.toHaveBeenCalled()
  })

  it('WS 未连接时跳过 BotAPI 调用', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'checkin' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockGroupApi = createMockGroupApi()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      mockGroupApi,
      createMockPool(false),
      createMockCache(),
      createMockRouter(),
      {},
      'aemeath-tasks',
    )
    executor.start()

    mockEvents.emit('completed', {
      jobId: '2',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'sendGroupSign', args: ['100'] }],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockGroupApi.sendGroupSign).not.toHaveBeenCalled()
  })

  it('有非 master 账号在线但 master 不在线时跳过 BotAPI 调用（master_apis 均为 master 专属通道）', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'checkin' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockGroupApi = createMockGroupApi()
    // hasClients=true（有非 master 账号在线）、hasMasterClients=false（master 不在线）
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      mockGroupApi,
      createMockPool(true, false),
      createMockCache(),
      createMockRouter(),
      {},
      'aemeath-tasks',
    )
    executor.start()

    mockEvents.emit('completed', {
      jobId: '2b',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'sendGroupSign', args: ['100'] }],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockGroupApi.sendGroupSign).not.toHaveBeenCalled()
  })

  it('白名单内方法正常调用', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'like' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockFriendApi = createMockFriendApi()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      mockFriendApi,
      createMockGroupApi(),
      createMockPool(),
      createMockCache(),
      createMockRouter(),
      {},
      'aemeath-tasks',
    )
    executor.start()

    mockEvents.emit('completed', {
      jobId: '3',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'sendLike', args: ['111', 10] }],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockFriendApi.sendLike).toHaveBeenCalledWith(111, 10)
  })

  it('白名单外方法被拒绝', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'evil' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockGroupApi = createMockGroupApi()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      mockGroupApi,
      createMockPool(),
      createMockCache(),
      createMockRouter(),
      {},
      'aemeath-tasks',
    )
    executor.start()

    mockEvents.emit('completed', {
      jobId: '4',
      returnvalue: {
        type: 'bot-action',
        calls: [{ method: 'deleteMsg', args: ['999'] }],
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect((mockGroupApi as unknown as Record<string, unknown>).deleteMsg).toBeUndefined()
    expect(mockGroupApi.sendGroupSign).not.toHaveBeenCalled()
  })

  it('sendGroupSign 成功后通过 postCacheOps 写入打卡去重键', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'checkin' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const mockGroupApi = createMockGroupApi()
    const cache = createMockCache()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      mockGroupApi,
      createMockPool(),
      cache,
      createMockRouter(),
      {},
      'aemeath-tasks',
    )
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
    expect(mockGroupApi.sendGroupSign).toHaveBeenCalledWith(300)
    expect(cache.set).toHaveBeenCalledOnce()
    // 验证 cache.set 的第三个参数是 TTL（90000）
    expect((cache.set as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toBe(90_000)
  })
})

describe('render-send result', () => {
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

  it('从 temp key 取图并调用 router.sendGroupMsg', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'render' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const cache = createMockCache()
    ;(cache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('base64pngdata')

    const mockRouter = createMockRouter()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      createMockGroupApi(),
      createMockPool(),
      cache,
      mockRouter,
      {},
      'test-queue',
    )
    executor.start()

    const result: RenderSendJobResult = {
      type: 'render-send',
      tempKey: 'aemeath:render:temp:job-1',
      sendTo: { groupId: '12345' },
    }
    mockEvents.emit('completed', { jobId: 'job-1', returnvalue: result })
    await new Promise((r) => setTimeout(r, 30))

    expect(mockRouter.sendGroupMsg).toHaveBeenCalledWith(
      '12345',
      expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
    )
    expect(cache.del).toHaveBeenCalledWith('aemeath:render:temp:job-1')
  })

  it('temp key 过期时打 warn 并跳过发送', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'render' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const cache = createMockCache()
    // 默认 get 返回 null（已在 createMockCache 中设置）

    const mockRouter = createMockRouter()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      createMockGroupApi(),
      createMockPool(),
      cache,
      mockRouter,
      {},
      'test-queue',
    )
    executor.start()

    const result: RenderSendJobResult = {
      type: 'render-send',
      tempKey: 'aemeath:render:temp:job-expired',
      sendTo: { groupId: '12345' },
    }
    mockEvents.emit('completed', { jobId: 'job-2', returnvalue: result })
    await new Promise((r) => setTimeout(r, 30))

    expect(mockRouter.sendGroupMsg).not.toHaveBeenCalled()
  })

  it('sendTo userId 时调用 router.sendPrivateMsg', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'render' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const cache = createMockCache()
    ;(cache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('imgdata')

    const mockRouter = createMockRouter()
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      createMockGroupApi(),
      createMockPool(),
      cache,
      mockRouter,
      {},
      'test-queue',
    )
    executor.start()

    const result: RenderSendJobResult = {
      type: 'render-send',
      tempKey: 'aemeath:render:temp:job-pm',
      sendTo: { userId: '9999' },
    }
    mockEvents.emit('completed', { jobId: 'job-3', returnvalue: result })
    await new Promise((r) => setTimeout(r, 30))

    expect(mockRouter.sendPrivateMsg).toHaveBeenCalledWith(
      '9999',
      expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
    )
    expect(cache.del).toHaveBeenCalledWith('aemeath:render:temp:job-pm')
  })

  it('只有 normal 账号在线、无 master 账号时 render-send 仍能正常发送（不再绑定 master 专属通道）', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'render' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const cache = createMockCache()
    ;(cache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('base64pngdata')

    const mockRouter = createMockRouter()
    // hasClients=true（有非 master 账号在线）、hasMasterClients=false（master 不在线）——
    // 验证 render-send 不再依赖 pool 的 master 角色检查，而是完全交给 router 决定路由。
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      createMockGroupApi(),
      createMockPool(true, false),
      cache,
      mockRouter,
      {},
      'test-queue',
    )
    executor.start()

    const result: RenderSendJobResult = {
      type: 'render-send',
      tempKey: 'aemeath:render:temp:job-no-master',
      sendTo: { groupId: '12345' },
    }
    mockEvents.emit('completed', { jobId: 'job-4', returnvalue: result })
    await new Promise((r) => setTimeout(r, 30))

    expect(mockRouter.sendGroupMsg).toHaveBeenCalledWith(
      '12345',
      expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
    )
    expect(cache.del).toHaveBeenCalledWith('aemeath:render:temp:job-no-master')
  })

  it('router 抛出"无可用账号"异常时记录 error 并清理 temp key，不向上抛出', async () => {
    const { Job } = await import('bullmq')
    Job.fromId = vi.fn().mockResolvedValue({ name: 'render' })

    const { TaskExecutor } = await import('@/core/tasks/executor.js')
    const cache = createMockCache()
    ;(cache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce('base64pngdata')

    const mockRouter = createMockRouter()
    ;(mockRouter.sendGroupMsg as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('当前群无可用账号发送消息'),
    )
    const executor = new TaskExecutor(
      createMockMsgApi(),
      createMockFriendApi(),
      createMockGroupApi(),
      createMockPool(),
      cache,
      mockRouter,
      {},
      'test-queue',
    )
    executor.start()

    const result: RenderSendJobResult = {
      type: 'render-send',
      tempKey: 'aemeath:render:temp:job-offline',
      sendTo: { groupId: '12345' },
    }
    mockEvents.emit('completed', { jobId: 'job-5', returnvalue: result })
    await new Promise((r) => setTimeout(r, 30))

    expect(mockRouter.sendGroupMsg).toHaveBeenCalledOnce()
    expect(cache.del).toHaveBeenCalledWith('aemeath:render:temp:job-offline')
  })
})
