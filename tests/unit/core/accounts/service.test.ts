import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AemeathPrismaClient } from '@/core/db/index.js'

/* Mock NapCatClientAdapter —— 避免真实构造 WebSocketTransport / 发起连接 */

const mockAdapterInstances: {
  id: string
  client: object
  state: string
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  healthCheck: ReturnType<typeof vi.fn>
  wireToPool: ReturnType<typeof vi.fn>
}[] = []

vi.mock('@/core/accounts/adapter.js', () => {
  const NapCatClientAdapter = vi.fn().mockImplementation(function (account: { qq: string }) {
    const instance = {
      id: account.qq,
      client: {},
      state: 'disconnected',
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      healthCheck: vi.fn().mockResolvedValue(true),
      wireToPool: vi.fn(),
    }
    mockAdapterInstances.push(instance)
    return instance
  })
  return { NapCatClientAdapter }
})

vi.mock('@/core/accounts/status-broadcaster.js', () => ({
  accountStatusBroadcaster: { broadcast: vi.fn() },
}))

const { AccountService } = await import('@/core/accounts/service.js')
const { accountStatusBroadcaster } = await import('@/core/accounts/status-broadcaster.js')

/* Mock 工厂 */

function createMockDb() {
  return {
    account: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  }
}

function createMockPool() {
  return {
    getClient: vi.fn(),
    removeClient: vi.fn().mockResolvedValue(undefined),
    addClient: vi.fn(),
    getClientsByRole: vi.fn(),
    getAvailableClients: vi.fn(),
    connectAll: vi.fn(),
    disconnectAll: vi.fn(),
    startHealthCheck: vi.fn(),
    stopHealthCheck: vi.fn(),
  }
}

function createMockSettings() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockRouter() {
  return {
    setPriorityMode: vi.fn(),
  }
}

type MockDb = ReturnType<typeof createMockDb>
type MockPool = ReturnType<typeof createMockPool>

const baseAccount = {
  qq: '100000',
  nickname: '测试1',
  role: 'master',
  transport: 'ws' as const,
  endpoint: 'ws://127.0.0.1:6100',
  token: '1234',
  isEnabled: true,
  lastConnectedAt: null,
  disabledReason: null,
}

describe('AccountService', () => {
  let mockDb: MockDb
  let mockPool: MockPool

  beforeEach(() => {
    mockAdapterInstances.length = 0
    mockDb = createMockDb()
    mockPool = createMockPool()
    vi.clearAllMocks()
  })

  describe('createAccount()', () => {
    it('isEnabled=true 且注入了 pool 时，用新账号数据构造 adapter 并 addClient，且自动尝试连接', async () => {
      mockDb.account.create.mockResolvedValue(baseAccount)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      const result = await svc.createAccount({
        qq: baseAccount.qq,
        role: 'master',
        transport: 'ws',
        endpoint: baseAccount.endpoint,
        isEnabled: true,
      })

      expect(result).toEqual(baseAccount)
      expect(mockPool.addClient).toHaveBeenCalledTimes(1)
      expect(mockAdapterInstances).toHaveLength(1)
      expect(mockPool.addClient).toHaveBeenCalledWith(mockAdapterInstances[0], 'master')
      expect(mockAdapterInstances[0]!.connect).toHaveBeenCalledTimes(1)
    })

    it('创建后立即广播 connecting 状态', async () => {
      mockDb.account.create.mockResolvedValue(baseAccount)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.createAccount({
        qq: baseAccount.qq,
        role: 'master',
        transport: 'ws',
        endpoint: baseAccount.endpoint,
        isEnabled: true,
      })

      expect(accountStatusBroadcaster.broadcast).toHaveBeenCalledWith({
        ...baseAccount,
        state: 'connecting',
      })
    })

    it('isEnabled=false 时不加入 pool', async () => {
      mockDb.account.create.mockResolvedValue({ ...baseAccount, isEnabled: false })
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.createAccount({
        qq: baseAccount.qq,
        role: 'master',
        transport: 'ws',
        endpoint: baseAccount.endpoint,
        isEnabled: false,
      })

      expect(mockPool.addClient).not.toHaveBeenCalled()
    })

    it('未注入 pool 时正常创建，不抛出异常', async () => {
      mockDb.account.create.mockResolvedValue(baseAccount)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient)

      await expect(
        svc.createAccount({
          qq: baseAccount.qq,
          role: 'master',
          transport: 'ws',
          endpoint: baseAccount.endpoint,
          isEnabled: true,
        }),
      ).resolves.toEqual(baseAccount)
    })
  })

  describe('updateAccount()', () => {
    it('仅改无关字段（nickname）时不触碰 pool', async () => {
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      mockDb.account.update.mockResolvedValue({ ...baseAccount, nickname: '新昵称' })
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount('100000', { nickname: '新昵称' })

      expect(mockPool.removeClient).not.toHaveBeenCalled()
      expect(mockPool.addClient).not.toHaveBeenCalled()
    })

    it('endpoint 变化且旧 adapter 处于 connected 状态：重建 adapter 并自动重连', async () => {
      mockPool.getClient.mockReturnValue({
        state: 'connected',
        client: { removeAllListeners: vi.fn() },
      })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount('100000', { endpoint: 'ws://127.0.0.1:9999' })

      expect(mockPool.removeClient).toHaveBeenCalledWith('100000')
      expect(mockPool.addClient).toHaveBeenCalledTimes(1)
      const [newAdapterArg] = mockPool.addClient.mock.calls[0] as [{ connect: () => unknown }]
      expect(mockAdapterInstances).toContain(newAdapterArg)
      expect(newAdapterArg.connect).toHaveBeenCalledTimes(1)
    })

    it('endpoint 变化但旧 adapter 非 connected 状态：重建 adapter，不自动重连', async () => {
      mockPool.getClient.mockReturnValue({
        state: 'disconnected',
        client: { removeAllListeners: vi.fn() },
      })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount('100000', { endpoint: 'ws://127.0.0.1:9999' })

      expect(mockPool.removeClient).toHaveBeenCalledWith('100000')
      expect(mockPool.addClient).toHaveBeenCalledTimes(1)
      const [newAdapterArg] = mockPool.addClient.mock.calls[0] as [{ connect: () => unknown }]
      expect(newAdapterArg.connect).not.toHaveBeenCalled()
    })

    it('isEnabled: true -> false 时仅 removeClient，不 addClient', async () => {
      mockPool.getClient.mockReturnValue({
        state: 'connected',
        client: { removeAllListeners: vi.fn() },
      })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, isEnabled: false }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount('100000', { isEnabled: false })

      expect(mockPool.removeClient).toHaveBeenCalledWith('100000')
      expect(mockPool.addClient).not.toHaveBeenCalled()
    })

    it('isEnabled: false -> true 时用最新字段构造新 adapter 加入 pool，并自动尝试连接', async () => {
      const disabledAccount = { ...baseAccount, isEnabled: false }
      mockPool.getClient.mockReturnValue(undefined)
      mockDb.account.findUnique.mockResolvedValue(disabledAccount)
      const updated = { ...baseAccount, isEnabled: true }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount('100000', { isEnabled: true })

      expect(mockPool.addClient).toHaveBeenCalledTimes(1)
      const [newAdapterArg] = mockPool.addClient.mock.calls[0] as [{ connect: () => unknown }]
      expect(newAdapterArg.connect).toHaveBeenCalledTimes(1)
    })

    it('重连失败时仍然 resolve（不向上抛出），返回更新后的账号', async () => {
      mockPool.getClient.mockReturnValue({
        state: 'connected',
        client: { removeAllListeners: vi.fn() },
      })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      // 让下一次构造出的 adapter 的 connect() reject
      const NapCatClientAdapterModule = await import('@/core/accounts/adapter.js')
      vi.mocked(NapCatClientAdapterModule.NapCatClientAdapter).mockImplementationOnce(
        function (account: { qq: string }) {
          const instance = {
            id: account.qq,
            client: {},
            state: 'disconnected',
            connect: vi.fn().mockRejectedValue(new Error('连接失败')),
            disconnect: vi.fn().mockResolvedValue(undefined),
            healthCheck: vi.fn().mockResolvedValue(true),
            wireToPool: vi.fn(),
          }
          mockAdapterInstances.push(instance)
          return instance as never
        },
      )

      await expect(
        svc.updateAccount('100000', { endpoint: 'ws://127.0.0.1:9999' }),
      ).resolves.toEqual(updated)
    })

    it('未注入 pool 时正常更新，不抛出异常，也不访问 pool', async () => {
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient)

      await expect(
        svc.updateAccount('100000', { endpoint: 'ws://127.0.0.1:9999' }),
      ).resolves.toEqual(updated)
    })

    it('isEnabled true -> false 时写入 disabledReason: manual', async () => {
      mockPool.getClient.mockReturnValue({
        state: 'connected',
        client: { removeAllListeners: vi.fn() },
      })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, isEnabled: false, disabledReason: 'manual' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount('100000', { isEnabled: false })

      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { qq: '100000' },
        data: { isEnabled: false, disabledReason: 'manual' },
      })
    })

    it('isEnabled false -> true 时清空 disabledReason', async () => {
      const disabledAccount = { ...baseAccount, isEnabled: false, disabledReason: 'manual' }
      mockPool.getClient.mockReturnValue(undefined)
      mockDb.account.findUnique.mockResolvedValue(disabledAccount)
      const updated = { ...baseAccount, isEnabled: true, disabledReason: null }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount('100000', { isEnabled: true })

      expect(mockDb.account.update).toHaveBeenCalledWith({
        where: { qq: '100000' },
        data: { isEnabled: true, disabledReason: null },
      })
    })
  })

  describe('listAccountsWithStatus()', () => {
    it('组合 DB 账号信息与 pool 中的实时状态', async () => {
      mockDb.account.findMany.mockResolvedValue([baseAccount])
      mockPool.getClient.mockReturnValue({ state: 'connected' })
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      const result = await svc.listAccountsWithStatus()

      expect(mockPool.getClient).toHaveBeenCalledWith('100000')
      expect(result).toEqual([{ ...baseAccount, state: 'connected' }])
    })

    it('未注入 pool 时 state 一律为 unknown', async () => {
      mockDb.account.findMany.mockResolvedValue([baseAccount])
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient)

      const result = await svc.listAccountsWithStatus()

      expect(result).toEqual([{ ...baseAccount, state: 'unknown' }])
    })

    it('pool 中找不到对应客户端时 state 为 unknown', async () => {
      mockDb.account.findMany.mockResolvedValue([baseAccount])
      mockPool.getClient.mockReturnValue(undefined)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      const result = await svc.listAccountsWithStatus()

      expect(result).toEqual([{ ...baseAccount, state: 'unknown' }])
    })
  })

  describe('getAccountWithStatus()', () => {
    it('账号存在且 pool 中有对应客户端时返回组合状态', async () => {
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      mockPool.getClient.mockReturnValue({ state: 'connected' })
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      const result = await svc.getAccountWithStatus('100000')

      expect(result).toEqual({ ...baseAccount, state: 'connected' })
    })

    it('账号不存在时返回 null', async () => {
      mockDb.account.findUnique.mockResolvedValue(null)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      const result = await svc.getAccountWithStatus('nonexistent')

      expect(result).toBeNull()
    })

    it('未注入 pool 时 state 为 unknown', async () => {
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient)

      const result = await svc.getAccountWithStatus('100000')

      expect(result).toEqual({ ...baseAccount, state: 'unknown' })
    })
  })

  describe('getPriorityMode() / setPriorityMode()', () => {
    it('getPriorityMode 从 settings 读取 accounts.priority_mode（系统级 scope）', async () => {
      const mockSettings = createMockSettings()
      mockSettings.get.mockResolvedValue('prefer_normal')
      const svc = new AccountService(
        mockDb as unknown as AemeathPrismaClient,
        undefined,
        undefined,
        mockSettings as never,
      )

      const mode = await svc.getPriorityMode()

      expect(mode).toBe('prefer_normal')
      expect(mockSettings.get).toHaveBeenCalledWith('accounts.priority_mode', [])
    })

    it('未注入 settings 时 getPriorityMode 抛出异常', async () => {
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient)
      await expect(svc.getPriorityMode()).rejects.toThrow()
    })

    it('setPriorityMode 写入 settings 并驱动 router 立即生效', async () => {
      const mockSettings = createMockSettings()
      const mockRouter = createMockRouter()
      const svc = new AccountService(
        mockDb as unknown as AemeathPrismaClient,
        undefined,
        mockRouter as never,
        mockSettings as never,
      )

      await svc.setPriorityMode('prefer_normal')

      expect(mockSettings.set).toHaveBeenCalledWith(
        'accounts.priority_mode',
        'prefer_normal',
        [],
        '__system__',
        { bypassOwnership: true },
      )
      expect(mockRouter.setPriorityMode).toHaveBeenCalledWith('prefer_normal')
    })

    it('未注入 settings 时 setPriorityMode 抛出异常，不调用 router', async () => {
      const mockRouter = createMockRouter()
      const svc = new AccountService(
        mockDb as unknown as AemeathPrismaClient,
        undefined,
        mockRouter as never,
      )

      await expect(svc.setPriorityMode('prefer_normal')).rejects.toThrow()
      expect(mockRouter.setPriorityMode).not.toHaveBeenCalled()
    })
  })
})
