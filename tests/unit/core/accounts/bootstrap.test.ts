import type { NapCatClient } from '@aemeath-projects/napcat'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createLiveMasterApi, MultiAccountBootstrap } from '@/core/accounts/bootstrap.js'
import { AccountService } from '@/core/accounts/service.js'
import type { AccountWithStatus } from '@/core/accounts/service.js'
import { accountStatusBroadcaster } from '@/core/accounts/status-broadcaster.js'

const { debugMock, infoMock } = vi.hoisted(() => ({
  debugMock: vi.fn(),
  infoMock: vi.fn(),
}))

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  getLogger: () => ({ debug: debugMock, info: infoMock, warn: vi.fn(), error: vi.fn() }),
}))

interface TestableBootstrap {
  db: { account: { update: ReturnType<typeof vi.fn> } }
  pool: { getClient: ReturnType<typeof vi.fn>; removeClient: ReturnType<typeof vi.fn> }
  _routingTable: { invalidate: ReturnType<typeof vi.fn> }
  _handleClientStateChange: (clientId: string, from: string, to: string) => void
  _autoDisableAfterGiveUp: (clientId: string) => Promise<void>
}

const sampleStatus: AccountWithStatus = {
  qq: '100000',
  nickname: null,
  role: 'master',
  transport: 'ws',
  endpoint: 'ws://127.0.0.1:1',
  token: null,
  isEnabled: true,
  state: 'connected',
}

describe('MultiAccountBootstrap', () => {
  let testable: TestableBootstrap

  beforeEach(() => {
    const bootstrap = new MultiAccountBootstrap()
    testable = bootstrap as unknown as TestableBootstrap
    testable.db = { account: { update: vi.fn().mockResolvedValue(undefined) } }
    testable.pool = { getClient: vi.fn(), removeClient: vi.fn().mockResolvedValue(undefined) }
    testable._routingTable = { invalidate: vi.fn() }
    vi.spyOn(accountStatusBroadcaster, 'broadcast').mockImplementation(() => {})
    // 直接 mock getAccountWithStatus 的返回值，绕过 AccountService 内部对 db.account.findUnique
    // 的真实调用——本文件的 testable.db 只需要提供 _handleClientStateChange 自身用到的 update()。
    vi.spyOn(AccountService.prototype, 'getAccountWithStatus').mockResolvedValue(sampleStatus)
  })

  afterEach(() => {
    // accountStatusBroadcaster 是全局单例，AccountService.prototype 是共享原型——
    // 不清理会导致 spy 的调用历史跨用例累积，虽然目前的断言都是 toHaveBeenCalledWith
    // （存在性匹配，不受累积影响），但一旦有人加上 toHaveBeenCalledTimes 之类的断言
    // 就会产生难以定位的 flaky。
    vi.restoreAllMocks()
  })

  describe('_handleClientStateChange', () => {
    it('状态变为 disconnected 时清除路由映射', () => {
      testable._handleClientStateChange('1', 'connected', 'disconnected')
      expect(testable._routingTable.invalidate).toHaveBeenCalledWith('1')
    })

    it('状态变为 error 时清除路由映射', () => {
      testable._handleClientStateChange('1', 'connecting', 'error')
      expect(testable._routingTable.invalidate).toHaveBeenCalledWith('1')
    })

    it('状态变为 connected 时不清除路由映射', () => {
      testable.pool.getClient.mockReturnValue(undefined)
      testable._handleClientStateChange('1', 'disconnected', 'connected')
      expect(testable._routingTable.invalidate).not.toHaveBeenCalled()
    })

    it('状态变为 error 时调用 _autoDisableAfterGiveUp', () => {
      const spy = vi.spyOn(testable, '_autoDisableAfterGiveUp').mockResolvedValue(undefined)

      testable._handleClientStateChange('1', 'connecting', 'error')

      expect(spy).toHaveBeenCalledWith('1')
    })

    it('状态变为 disconnected（非 error）时不调用 _autoDisableAfterGiveUp', () => {
      const spy = vi.spyOn(testable, '_autoDisableAfterGiveUp').mockResolvedValue(undefined)

      testable._handleClientStateChange('1', 'connected', 'disconnected')

      expect(spy).not.toHaveBeenCalled()
    })

    it('状态变为 connected 时广播最新账号状态', async () => {
      testable.pool.getClient.mockReturnValue(undefined)

      testable._handleClientStateChange('1', 'disconnected', 'connected')

      await vi.waitFor(() => {
        expect(accountStatusBroadcaster.broadcast).toHaveBeenCalledWith(sampleStatus)
      })
    })

    it('状态变为 disconnected 时广播最新账号状态', async () => {
      testable._handleClientStateChange('1', 'connected', 'disconnected')

      await vi.waitFor(() => {
        expect(accountStatusBroadcaster.broadcast).toHaveBeenCalledWith(sampleStatus)
      })
    })

    it('状态变为 reconnecting 时不清除路由映射，只广播最新账号状态', async () => {
      testable._handleClientStateChange('1', 'disconnected', 'reconnecting')

      expect(testable._routingTable.invalidate).not.toHaveBeenCalled()
      await vi.waitFor(() => {
        expect(accountStatusBroadcaster.broadcast).toHaveBeenCalledWith(sampleStatus)
      })
    })

    it('状态变为 error 时，自动禁用完成后才广播最新账号状态', async () => {
      const order: string[] = []
      // _autoDisableAfterGiveUp 用真实的微任务延迟（而不是零延迟的 async 函数体）
      // 才能让"谁先被调用"和"谁先完成"这两件事产生可观察的区分——如果两边都是
      // 零延迟，无论调用顺序如何，push 的先后完全取决于各自需要几次微任务跳转，
      // 测试就失去了对调用顺序错误的识别能力。
      const spy = vi.spyOn(testable, '_autoDisableAfterGiveUp').mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push('autoDisable')
      })
      vi.mocked(accountStatusBroadcaster.broadcast).mockImplementation(() => {
        order.push('broadcast')
      })

      testable._handleClientStateChange('1', 'connecting', 'error')

      await vi.waitFor(() => {
        expect(order).toEqual(['autoDisable', 'broadcast'])
      })
      expect(spy).toHaveBeenCalledWith('1')
    })

    it('状态变为 connected 时输出 debug 级别日志（而非 info，避免生产日志噪音）', () => {
      debugMock.mockClear()
      testable.pool.getClient.mockReturnValue(undefined)

      testable._handleClientStateChange('1', 'disconnected', 'connected')

      expect(debugMock).toHaveBeenCalledWith('账号 1 已（重新）连接')
    })
  })

  describe('_autoDisableAfterGiveUp', () => {
    it('将账号 isEnabled 置为 false 并从 pool 移除', async () => {
      testable.pool.getClient.mockReturnValue({ id: '100000' })

      await testable._autoDisableAfterGiveUp('100000')

      expect(testable.db.account.update).toHaveBeenCalledWith({
        where: { qq: '100000' },
        data: { isEnabled: false },
      })
      expect(testable.pool.removeClient).toHaveBeenCalledWith('100000')
    })

    it('pool 中找不到客户端时不调用 removeClient', async () => {
      testable.pool.getClient.mockReturnValue(undefined)

      await testable._autoDisableAfterGiveUp('100000')

      expect(testable.pool.removeClient).not.toHaveBeenCalled()
    })
  })

  describe('createLiveMasterApi', () => {
    /** 最小假 API 类：构造时记录传入的 client，方法读取 client.id 证明用的是哪个 client 实例。 */
    class FakeApi {
      private readonly clientId: string
      constructor(client: NapCatClient) {
        this.clientId = (client as unknown as { id: string }).id
      }
      getId(): string {
        return this.clientId
      }
    }

    function fakeClient(id: string): NapCatClient {
      return { id } as unknown as NapCatClient
    }

    it('每次调用方法都现查连接池，account adapter 被重建后自动切换到新 client', () => {
      const clientA = fakeClient('client-A')
      const clientB = fakeClient('client-B')
      const getAvailableClients = vi.fn().mockReturnValue([{ client: clientA }])
      const fakePool = { getAvailableClients } as unknown as Parameters<
        typeof createLiveMasterApi
      >[0]

      const api = createLiveMasterApi(fakePool, FakeApi)

      expect(api.getId()).toBe('client-A')

      // 模拟 master 账号被禁用后重新启用：adapter 重建，pool 现在返回全新的 client 实例
      getAvailableClients.mockReturnValue([{ client: clientB }])

      expect(api.getId()).toBe('client-B')
      expect(getAvailableClients).toHaveBeenCalledWith('master')
    })

    it('找不到在线 master 时调用方法应抛出 AppError', () => {
      const getAvailableClients = vi.fn().mockReturnValue([])
      const fakePool = { getAvailableClients } as unknown as Parameters<
        typeof createLiveMasterApi
      >[0]

      const api = createLiveMasterApi(fakePool, FakeApi)

      expect(() => api.getId()).toThrow('主账号不在线，无法调用 Bot API')
    })
  })
})
