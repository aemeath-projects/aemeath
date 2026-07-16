import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import { LikeService } from '@/services/like.js'

function createMockDb() {
  return {
    likeHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
    likeTask: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  }
}

function createMockRouter() {
  return {
    sendLike: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  }
}

describe('LikeService', () => {
  let mockDb: ReturnType<typeof createMockDb>
  let mockRouter: ReturnType<typeof createMockRouter>
  let service: LikeService

  beforeEach(() => {
    mockDb = createMockDb()
    mockRouter = createMockRouter()
    service = new LikeService(
      mockDb as unknown as AemeathPrismaClient,
      mockRouter as unknown as MessageRouter,
    )
  })

  it('sendLikeNow 通过 router.sendLike 执行点赞，不再依赖 master 专属 FriendApi', async () => {
    const success = await service.sendLikeNow('123456', 10, 'manual')

    expect(mockRouter.sendLike).toHaveBeenCalledWith('123456', 10)
    expect(success).toBe(true)
    expect(mockDb.likeHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ qq: '123456', success: true }) }),
    )
  })

  it('router.sendLike 返回失败时 sendLikeNow 返回 false 且记录历史', async () => {
    mockRouter.sendLike.mockResolvedValueOnce({ ok: false, error: { code: -1, message: 'fail' } })

    const success = await service.sendLikeNow('123456', 10, 'manual')

    expect(success).toBe(false)
    expect(mockDb.likeHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false }) }),
    )
  })

  it('router.sendLike 抛出异常时 sendLikeNow 捕获并返回 false', async () => {
    mockRouter.sendLike.mockRejectedValueOnce(new Error('账号离线'))

    const success = await service.sendLikeNow('123456', 10, 'manual')

    expect(success).toBe(false)
  })
})
