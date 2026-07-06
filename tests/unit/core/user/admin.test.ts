import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MasterApis } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import { ValidationError } from '@/core/errors.js'
import type { RedisStore } from '@/core/redis/index.js'
import { AdminService } from '@/core/user/admin.js'

/* Mock 工厂 */

function createMockDb() {
  return {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    groupMembership: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}

function createMockCache() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    setNx: vi.fn(),
  }
}

function createMockMasterApis(friends: { userId: number; nickname: string }[] | null): MasterApis {
  return {
    msgApi: null,
    groupApi: null,
    friendApi:
      friends === null
        ? null
        : ({
            getFriendList: vi.fn().mockResolvedValue({ ok: true, data: friends }),
          } as unknown as MasterApis['friendApi']),
  }
}

type MockDb = ReturnType<typeof createMockDb>
type MockCache = ReturnType<typeof createMockCache>

describe('AdminService', () => {
  let mockDb: MockDb
  let mockCache: MockCache

  beforeEach(() => {
    mockDb = createMockDb()
    mockCache = createMockCache()
    mockCache.setNx.mockResolvedValue(true) // 默认锁总能拿到
  })

  function buildService(
    friends: { userId: number; nickname: string }[] | null = [{ userId: 999, nickname: '好友' }],
  ) {
    const masterApis = createMockMasterApis(friends)
    const svc = new AdminService(
      mockDb as unknown as AemeathPrismaClient,
      mockCache as unknown as RedisStore,
      masterApis,
    )
    return { svc, masterApis }
  }

  /* setAdmin() */

  describe('setAdmin()', () => {
    it('master 未在线时应当抛 ValidationError', async () => {
      const { svc } = buildService(null)
      await expect(svc.setAdmin(999n)).rejects.toThrow(ValidationError)
      expect(mockCache.setNx).not.toHaveBeenCalled()
    })

    it('候选不在好友列表时应当抛 ValidationError', async () => {
      const { svc } = buildService([{ userId: 111, nickname: '别人' }])
      await expect(svc.setAdmin(999n)).rejects.toThrow(ValidationError)
    })

    it('锁被占用时应当抛 ValidationError，不进入事务', async () => {
      mockCache.setNx.mockResolvedValue(false)
      const { svc } = buildService()

      await expect(svc.setAdmin(999n)).rejects.toThrow(ValidationError)
      expect(mockDb.$transaction).not.toHaveBeenCalled()
    })

    it('已有御者时设置新的：旧的有活跃群成员关系应降级为 group_member', async () => {
      const { svc } = buildService()
      mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findFirst: vi.fn().mockResolvedValue({ qq: 111n }),
            update: vi.fn(),
            upsert: vi.fn(),
          },
          groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) },
        }
        await fn(tx)
        expect(tx.user.update).toHaveBeenCalledWith({
          where: { qq: 111n },
          data: { relation: 'group_member' },
        })
        expect(tx.user.upsert).toHaveBeenCalledWith({
          where: { qq: 999n },
          create: { qq: 999n, nickname: '好友', relation: 'admin' },
          update: { relation: 'admin' },
        })
        return 111n
      })

      await svc.setAdmin(999n)
    })

    it('旧御者仍是好友时应降级为 friend，即使有活跃群成员关系（好友优先级高于群成员关系）', async () => {
      const { svc } = buildService([
        { userId: 999, nickname: '新御者' },
        { userId: 111, nickname: '旧御者' },
      ])
      mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findFirst: vi.fn().mockResolvedValue({ qq: 111n }),
            update: vi.fn(),
            upsert: vi.fn(),
          },
          groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) },
        }
        await fn(tx)
        expect(tx.user.update).toHaveBeenCalledWith({
          where: { qq: 111n },
          data: { relation: 'friend' },
        })
        return 111n
      })

      await svc.setAdmin(999n)
    })

    it('旧御者无活跃群成员关系应降级为 stranger', async () => {
      const { svc } = buildService()
      mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findFirst: vi.fn().mockResolvedValue({ qq: 111n }),
            update: vi.fn(),
            upsert: vi.fn(),
          },
          groupMembership: { findFirst: vi.fn().mockResolvedValue(null) },
        }
        await fn(tx)
        expect(tx.user.update).toHaveBeenCalledWith({
          where: { qq: 111n },
          data: { relation: 'stranger' },
        })
        return 111n
      })

      await svc.setAdmin(999n)
    })

    it('目标 qq 不在 User 表中时应通过 upsert 创建新记录而不是抛错', async () => {
      const { svc } = buildService([{ userId: 999, nickname: '新用户' }])
      mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), upsert: vi.fn() },
          groupMembership: { findFirst: vi.fn() },
        }
        await fn(tx)
        expect(tx.user.upsert).toHaveBeenCalledWith({
          where: { qq: 999n },
          create: { qq: 999n, nickname: '新用户', relation: 'admin' },
          update: { relation: 'admin' },
        })
        return null
      })

      await expect(svc.setAdmin(999n)).resolves.toBeUndefined()
    })

    it('重复设置同一 qq 为御者应当幂等，不降级自己', async () => {
      const { svc } = buildService()
      mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            findFirst: vi.fn().mockResolvedValue({ qq: 999n }),
            update: vi.fn(),
            upsert: vi.fn(),
          },
          groupMembership: { findFirst: vi.fn() },
        }
        await fn(tx)
        // current.qq === qq，不应触发降级分支
        expect(tx.groupMembership.findFirst).not.toHaveBeenCalled()
        return null
      })

      await expect(svc.setAdmin(999n)).resolves.toBeUndefined()
    })

    it('成功后应当释放锁（无论成功失败都要 del）', async () => {
      const { svc } = buildService()
      mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), upsert: vi.fn() },
          groupMembership: { findFirst: vi.fn() },
        }
        return fn(tx)
      })

      await svc.setAdmin(999n)

      expect(mockCache.del).toHaveBeenCalledWith('aemeath:lock:admin')
    })

    it('事务抛异常时也应当释放锁', async () => {
      const { svc } = buildService()
      mockDb.$transaction.mockRejectedValue(new Error('事务失败'))

      await expect(svc.setAdmin(999n)).rejects.toThrow('事务失败')

      expect(mockCache.del).toHaveBeenCalledWith('aemeath:lock:admin')
    })
  })

  /* removeAdmin() */

  describe('removeAdmin()', () => {
    it('无御者时应当返回 false', async () => {
      mockDb.user.findFirst.mockResolvedValue(null)

      const result = await AdminService.prototype.removeAdmin.call(buildService().svc)
      expect(result).toBe(false)
    })

    it('有御者且有活跃群成员关系时应降级为 group_member', async () => {
      mockDb.user.findFirst.mockResolvedValue({ qq: 111n })
      mockDb.groupMembership.findFirst.mockResolvedValue({ id: 'm1' })
      mockDb.user.update.mockResolvedValue({ qq: 111n, relation: 'group_member' })

      const { svc } = buildService()
      const result = await svc.removeAdmin()

      expect(result).toBe(true)
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { qq: 111n },
        data: { relation: 'group_member' },
      })
    })

    it('有御者且无活跃群成员关系时应降级为 stranger', async () => {
      mockDb.user.findFirst.mockResolvedValue({ qq: 111n })
      mockDb.groupMembership.findFirst.mockResolvedValue(null)
      mockDb.user.update.mockResolvedValue({ qq: 111n, relation: 'stranger' })

      const { svc } = buildService()
      const result = await svc.removeAdmin()

      expect(result).toBe(true)
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { qq: 111n },
        data: { relation: 'stranger' },
      })
    })

    it('锁被占用时应当抛 ValidationError', async () => {
      mockCache.setNx.mockResolvedValue(false)
      const { svc } = buildService()

      await expect(svc.removeAdmin()).rejects.toThrow(ValidationError)
      expect(mockDb.user.findFirst).not.toHaveBeenCalled()
    })
  })

  /* getAdmins() */

  describe('getAdmins()', () => {
    it('应当查询 relation=admin 并映射为视图对象', async () => {
      mockDb.user.findFirst.mockResolvedValue(undefined) // 不影响 findMany 路径
      const findManyMock = vi
        .fn()
        .mockResolvedValue([
          {
            qq: 111n,
            nickname: '御者',
            relation: 'admin',
            lastSynced: new Date('2024-01-01T00:00:00Z'),
          },
        ])
      ;(mockDb as unknown as { user: { findMany: typeof findManyMock } }).user.findMany =
        findManyMock

      const { svc } = buildService()
      const result = await svc.getAdmins()

      expect(findManyMock).toHaveBeenCalledWith({ where: { relation: 'admin' } })
      expect(result).toEqual([
        { qq: 111n, nickname: '御者', relation: 'admin', lastSynced: '2024-01-01T00:00:00.000Z' },
      ])
    })
  })

  /* getAdminQq() */

  describe('getAdminQq()', () => {
    it('缓存未命中且数据库无御者时应当返回 null 并写入空哨兵', async () => {
      mockCache.get.mockResolvedValue(null)
      mockDb.user.findFirst.mockResolvedValue(null)

      const { svc } = buildService()
      const result = await svc.getAdminQq()

      expect(result).toBeNull()
      expect(mockCache.set).toHaveBeenCalledWith('aemeath:user:admin', '', 300)
    })

    it('缓存命中空字符串哨兵时应当直接返回 null，不查库', async () => {
      mockCache.get.mockResolvedValue('')

      const { svc } = buildService()
      const result = await svc.getAdminQq()

      expect(result).toBeNull()
      expect(mockDb.user.findFirst).not.toHaveBeenCalled()
    })

    it('缓存命中非空值时应当返回对应 bigint', async () => {
      mockCache.get.mockResolvedValue('123456')

      const { svc } = buildService()
      const result = await svc.getAdminQq()

      expect(result).toBe(123456n)
      expect(mockDb.user.findFirst).not.toHaveBeenCalled()
    })

    it('缓存未命中且数据库有御者时应当返回其 qq 并写入缓存', async () => {
      mockCache.get.mockResolvedValue(null)
      mockDb.user.findFirst.mockResolvedValue({ qq: 999n })

      const { svc } = buildService()
      const result = await svc.getAdminQq()

      expect(result).toBe(999n)
      expect(mockCache.set).toHaveBeenCalledWith('aemeath:user:admin', '999', 300)
    })
  })

  /* listCandidates() */

  describe('listCandidates()', () => {
    it('master 未在线时应当抛 ValidationError', async () => {
      const { svc } = buildService(null)
      await expect(svc.listCandidates()).rejects.toThrow(ValidationError)
    })

    it('好友列表获取失败时应当抛 ValidationError', async () => {
      const masterApis: MasterApis = {
        msgApi: null,
        groupApi: null,
        friendApi: {
          getFriendList: vi.fn().mockResolvedValue({ ok: false, error: 'timeout' }),
        } as unknown as MasterApis['friendApi'],
      }
      const svc = new AdminService(
        mockDb as unknown as AemeathPrismaClient,
        mockCache as unknown as RedisStore,
        masterApis,
      )
      await expect(svc.listCandidates()).rejects.toThrow(ValidationError)
    })

    it('成功时应当返回好友列表原始数据', async () => {
      const friends = [{ userId: 111, nickname: '好友甲' }]
      const { svc } = buildService(friends)
      const result = await svc.listCandidates()
      expect(result).toEqual(friends)
    })
  })
})
