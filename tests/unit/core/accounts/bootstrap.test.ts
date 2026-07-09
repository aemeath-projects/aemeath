import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MultiAccountBootstrap } from '@/core/accounts/bootstrap.js'

interface TestableBootstrap {
  db: { account: { update: ReturnType<typeof vi.fn> } }
  pool: { getClient: ReturnType<typeof vi.fn>; removeClient: ReturnType<typeof vi.fn> }
  _routingTable: { invalidate: ReturnType<typeof vi.fn> }
  _handleClientStateChange: (clientId: string, from: string, to: string) => void
  _autoDisableAfterGiveUp: (clientId: string) => Promise<void>
}

describe('MultiAccountBootstrap', () => {
  let testable: TestableBootstrap

  beforeEach(() => {
    const bootstrap = new MultiAccountBootstrap()
    testable = bootstrap as unknown as TestableBootstrap
    testable.db = { account: { update: vi.fn().mockResolvedValue(undefined) } }
    testable.pool = { getClient: vi.fn(), removeClient: vi.fn().mockResolvedValue(undefined) }
    testable._routingTable = { invalidate: vi.fn() }
  })

  describe('_handleClientStateChange', () => {
    it('状态变为 disconnected 时清除路由映射', () => {
      testable._handleClientStateChange('bot-1', 'connected', 'disconnected')
      expect(testable._routingTable.invalidate).toHaveBeenCalledWith('bot-1')
    })

    it('状态变为 error 时清除路由映射', () => {
      testable._handleClientStateChange('bot-1', 'connecting', 'error')
      expect(testable._routingTable.invalidate).toHaveBeenCalledWith('bot-1')
    })

    it('状态变为 connected 时不清除路由映射', () => {
      testable.pool.getClient.mockReturnValue(undefined)
      testable._handleClientStateChange('bot-1', 'disconnected', 'connected')
      expect(testable._routingTable.invalidate).not.toHaveBeenCalled()
    })

    it('状态变为 error 时调用 _autoDisableAfterGiveUp', () => {
      const spy = vi.spyOn(testable, '_autoDisableAfterGiveUp').mockResolvedValue(undefined)

      testable._handleClientStateChange('bot-1', 'connecting', 'error')

      expect(spy).toHaveBeenCalledWith('bot-1')
    })

    it('状态变为 disconnected（非 error）时不调用 _autoDisableAfterGiveUp', () => {
      const spy = vi.spyOn(testable, '_autoDisableAfterGiveUp').mockResolvedValue(undefined)

      testable._handleClientStateChange('bot-1', 'connected', 'disconnected')

      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('_autoDisableAfterGiveUp', () => {
    it('将账号 isEnabled 置为 false 并从 pool 移除', async () => {
      testable.pool.getClient.mockReturnValue({ id: 'bot-1739280698' })

      await testable._autoDisableAfterGiveUp('bot-1739280698')

      expect(testable.db.account.update).toHaveBeenCalledWith({
        where: { qq: '1739280698' },
        data: { isEnabled: false },
      })
      expect(testable.pool.removeClient).toHaveBeenCalledWith('bot-1739280698')
    })

    it('pool 中找不到客户端时不调用 removeClient', async () => {
      testable.pool.getClient.mockReturnValue(undefined)

      await testable._autoDisableAfterGiveUp('bot-1739280698')

      expect(testable.pool.removeClient).not.toHaveBeenCalled()
    })
  })
})
