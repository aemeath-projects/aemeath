import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import type { RedisStore } from '@/core/redis/index.js'
import type { SettingsService } from '@/core/settings/index.js'
// 导入 CheckinService 以注册 checkin cache keys
import '@/services/checkin.js'
import { DailyCheckinServiceImpl } from '@/services/daily-checkin.js'
import type { DailyCheckinService } from '@/services/daily-checkin.js'

function createMockDb(groupIds: string[] = ['100']) {
  return {
    group: {
      findMany: vi.fn().mockResolvedValue(groupIds.map((groupId) => ({ groupId }))),
    },
  }
}

function createMockCache() {
  return {
    exists: vi.fn().mockResolvedValue(false),
    set: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockRouter() {
  return {
    sendGroupSign: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  }
}

function createMockSettings() {
  return {
    get: vi.fn().mockResolvedValue(true),
  }
}

describe('DailyCheckinService', () => {
  let mockDb: ReturnType<typeof createMockDb>
  let mockCache: ReturnType<typeof createMockCache>
  let mockRouter: ReturnType<typeof createMockRouter>
  let mockSettings: ReturnType<typeof createMockSettings>
  let service: DailyCheckinService

  beforeEach(() => {
    mockDb = createMockDb()
    mockCache = createMockCache()
    mockRouter = createMockRouter()
    mockSettings = createMockSettings()
    service = new DailyCheckinServiceImpl(
      mockDb as unknown as AemeathPrismaClient,
      mockCache as unknown as RedisStore,
      mockRouter as unknown as MessageRouter,
      mockSettings as unknown as SettingsService,
    )
  })

  it('requestCheckin 触发后通过 router.sendGroupSign 执行签到，不再依赖 master 专属 GroupApi', async () => {
    const triggered = service.requestCheckin('scheduled')
    expect(triggered).toBe(true)

    await new Promise((r) => setTimeout(r, 50))

    expect(mockRouter.sendGroupSign).toHaveBeenCalledWith('100')
    expect(mockCache.set).toHaveBeenCalledOnce()
  })

  it('router.sendGroupSign 返回失败（ok: false）时不写入去重缓存', async () => {
    mockRouter.sendGroupSign.mockResolvedValueOnce({
      ok: false,
      error: { code: -1, message: 'group not found' },
    })

    service.requestCheckin('scheduled')
    await new Promise((r) => setTimeout(r, 50))

    expect(mockCache.set).not.toHaveBeenCalled()
  })

  it('已在执行时重复请求返回 false（防并发重入）', async () => {
    const first = service.requestCheckin('ws_connect')
    const second = service.requestCheckin('ws_connect')
    expect(first).toBe(true)
    expect(second).toBe(false)
    await new Promise((r) => setTimeout(r, 50))
  })
})
