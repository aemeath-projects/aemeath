import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MultiAccountBootstrap } from '@/core/accounts/bootstrap.js'
import { AccountService } from '@/core/accounts/service.js'
import type { AccountWithStatus } from '@/core/accounts/service.js'
import { accountStatusBroadcaster } from '@/core/accounts/status-broadcaster.js'

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
})
