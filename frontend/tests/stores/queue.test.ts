/** Queue Store 单元测试：任务队列状态管理与 SSE 实时推送。 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useQueueStore } from '@/stores/queue'

vi.mock('@/apis/queue', () => ({
  connectQueueStream: vi.fn(),
}))

import * as queueApi from '@/apis/queue'
import type { QueueStreamData } from '@/apis/queue'

const sampleData: QueueStreamData = {
  scheduledTasks: [
    {
      name: 'daily_checkin',
      task: 'daily_checkin.run',
      schedule: '0 0 * * *',
      scheduleRaw: 0,
      args: null,
      kwargs: null,
      options: { expires: null, queue: null },
      enabled: true,
    },
  ],
  activeTasks: [
    {
      worker: 'worker-1',
      id: 'task-1',
      name: 'daily_like.run',
      args: '[]',
      kwargs: '{}',
      started: 1700000000,
      acknowledged: true,
    },
  ],
  reservedTasks: [],
  pendingTasks: [],
  workers: [
    { name: 'worker-1', concurrency: 3, broker: 'redis', prefetchCount: 3, pid: 1, uptime: 100 },
  ],
  queueLength: { queue: 'aemeath-tasks', length: 0 },
}

describe('useQueueStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始状态为空数组且未连接', () => {
    const store = useQueueStore()
    expect(store.scheduledTasks).toEqual([])
    expect(store.allTasks).toEqual([])
    expect(store.connected).toBe(false)
    expect(store.error).toBeNull()
  })

  it('connect() 收到数据后写入各分类数组并合并 allTasks', () => {
    let onDataCallback: ((data: QueueStreamData) => void) | undefined
    vi.mocked(queueApi.connectQueueStream).mockImplementation((onData) => {
      onDataCallback = onData
      return vi.fn()
    })
    const store = useQueueStore()

    store.connect()
    onDataCallback?.(sampleData)

    expect(store.connected).toBe(true)
    expect(store.scheduledTasks).toEqual(sampleData.scheduledTasks)
    expect(store.activeTasks).toEqual(sampleData.activeTasks)
    expect(store.allTasks).toHaveLength(2)
    expect(store.allTasks.map((t) => t.category)).toEqual(['scheduled', 'active'])
  })

  it('connect() 收到 onError 回调时写入 error 字段', () => {
    let onErrorCallback: ((err: string) => void) | undefined
    vi.mocked(queueApi.connectQueueStream).mockImplementation((_onData, onError) => {
      onErrorCallback = onError
      return vi.fn()
    })
    const store = useQueueStore()

    store.connect()
    onErrorCallback?.('SSE 连接断开，正在重连…')

    expect(store.error).toBe('SSE 连接断开，正在重连…')
  })

  it('disconnect() 调用关闭函数并将 connected 置为 false', () => {
    const closeFn = vi.fn()
    vi.mocked(queueApi.connectQueueStream).mockReturnValue(closeFn)
    const store = useQueueStore()

    store.connect()
    store.disconnect()

    expect(closeFn).toHaveBeenCalledOnce()
    expect(store.connected).toBe(false)
  })

  it('重复调用 connect() 会先断开旧连接再建立新连接', () => {
    const closeFn1 = vi.fn()
    const closeFn2 = vi.fn()
    vi.mocked(queueApi.connectQueueStream)
      .mockReturnValueOnce(closeFn1)
      .mockReturnValueOnce(closeFn2)
    const store = useQueueStore()

    store.connect()
    store.connect()

    expect(closeFn1).toHaveBeenCalledOnce()
    expect(queueApi.connectQueueStream).toHaveBeenCalledTimes(2)
  })
})
