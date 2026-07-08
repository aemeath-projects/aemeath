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
  const NapCatClientAdapter = vi.fn().mockImplementation(function (account: { qq: bigint }) {
    const instance = {
      id: `bot-${String(account.qq)}`,
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

const { AccountService } = await import('@/core/accounts/service.js')

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

type MockDb = ReturnType<typeof createMockDb>
type MockPool = ReturnType<typeof createMockPool>

const baseAccount = {
  id: 1,
  qq: 1739280698n,
  nickname: '测试1',
  role: 'master',
  transport: 'ws' as const,
  endpoint: 'ws://127.0.0.1:6100',
  token: '1234',
  isEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
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
    it('isEnabled=true 且注入了 pool 时，用新账号数据构造 adapter 并 addClient', async () => {
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

      await svc.updateAccount(1, { nickname: '新昵称' })

      expect(mockPool.removeClient).not.toHaveBeenCalled()
      expect(mockPool.addClient).not.toHaveBeenCalled()
    })

    it('endpoint 变化且旧 adapter 处于 connected 状态：重建 adapter 并自动重连', async () => {
      mockPool.getClient.mockReturnValue({ state: 'connected' })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount(1, { endpoint: 'ws://127.0.0.1:9999' })

      expect(mockPool.removeClient).toHaveBeenCalledWith('bot-1739280698')
      expect(mockPool.addClient).toHaveBeenCalledTimes(1)
      const [newAdapterArg] = mockPool.addClient.mock.calls[0] as [{ connect: () => unknown }]
      expect(mockAdapterInstances).toContain(newAdapterArg)
      expect(newAdapterArg.connect).toHaveBeenCalledTimes(1)
    })

    it('endpoint 变化但旧 adapter 非 connected 状态：重建 adapter，不自动重连', async () => {
      mockPool.getClient.mockReturnValue({ state: 'disconnected' })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount(1, { endpoint: 'ws://127.0.0.1:9999' })

      expect(mockPool.removeClient).toHaveBeenCalledWith('bot-1739280698')
      expect(mockPool.addClient).toHaveBeenCalledTimes(1)
      const [newAdapterArg] = mockPool.addClient.mock.calls[0] as [{ connect: () => unknown }]
      expect(newAdapterArg.connect).not.toHaveBeenCalled()
    })

    it('isEnabled: true -> false 时仅 removeClient，不 addClient', async () => {
      mockPool.getClient.mockReturnValue({ state: 'connected' })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, isEnabled: false }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount(1, { isEnabled: false })

      expect(mockPool.removeClient).toHaveBeenCalledWith('bot-1739280698')
      expect(mockPool.addClient).not.toHaveBeenCalled()
    })

    it('isEnabled: false -> true 时用最新字段构造新 adapter 加入 pool，不自动连接', async () => {
      const disabledAccount = { ...baseAccount, isEnabled: false }
      mockPool.getClient.mockReturnValue(undefined)
      mockDb.account.findUnique.mockResolvedValue(disabledAccount)
      const updated = { ...baseAccount, isEnabled: true }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      await svc.updateAccount(1, { isEnabled: true })

      expect(mockPool.addClient).toHaveBeenCalledTimes(1)
      const [newAdapterArg] = mockPool.addClient.mock.calls[0] as [{ connect: () => unknown }]
      expect(newAdapterArg.connect).not.toHaveBeenCalled()
    })

    it('重连失败时仍然 resolve（不向上抛出），返回更新后的账号', async () => {
      mockPool.getClient.mockReturnValue({ state: 'connected' })
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient, mockPool as never)

      // 让下一次构造出的 adapter 的 connect() reject
      const NapCatClientAdapterModule = await import('@/core/accounts/adapter.js')
      vi.mocked(NapCatClientAdapterModule.NapCatClientAdapter).mockImplementationOnce(
        function (account: { qq: bigint }) {
          const instance = {
            id: `bot-${String(account.qq)}`,
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

      await expect(svc.updateAccount(1, { endpoint: 'ws://127.0.0.1:9999' })).resolves.toEqual(
        updated,
      )
    })

    it('未注入 pool 时正常更新，不抛出异常，也不访问 pool', async () => {
      mockDb.account.findUnique.mockResolvedValue(baseAccount)
      const updated = { ...baseAccount, endpoint: 'ws://127.0.0.1:9999' }
      mockDb.account.update.mockResolvedValue(updated)
      const svc = new AccountService(mockDb as unknown as AemeathPrismaClient)

      await expect(svc.updateAccount(1, { endpoint: 'ws://127.0.0.1:9999' })).resolves.toEqual(
        updated,
      )
    })
  })
})
