import { beforeEach, describe, expect, it, vi } from 'vitest'

const debugMock = vi.fn()

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  getLogger: () => ({ debug: debugMock, error: vi.fn() }),
}))

const sendGroupMsgMock = vi.fn()
const sendPrivateMsgMock = vi.fn()
const sendGroupSignMock = vi.fn()
const sendLikeMock = vi.fn()

vi.mock('@aemeath-projects/napcat', () => {
  const MessageApi = vi.fn(function (this: {
    sendGroupMsg: ReturnType<typeof vi.fn>
    sendPrivateMsg: ReturnType<typeof vi.fn>
  }) {
    this.sendGroupMsg = sendGroupMsgMock
    this.sendPrivateMsg = sendPrivateMsgMock
  })
  const GroupApi = vi.fn(function (this: { sendGroupSign: ReturnType<typeof vi.fn> }) {
    this.sendGroupSign = sendGroupSignMock
  })
  const FriendApi = vi.fn(function (this: { sendLike: ReturnType<typeof vi.fn> }) {
    this.sendLike = sendLikeMock
  })
  return { MessageApi, GroupApi, FriendApi }
})

const { MessageRouter } = await import('@/core/accounts/router.js')

function createMockPool() {
  return {
    getClient: vi.fn(),
    getClientRole: vi.fn(),
    getClientsByRole: vi.fn(),
    getAvailableClients: vi.fn(),
  }
}

function createMockRoutingTable() {
  return {
    resolve: vi.fn(),
    clear: vi.fn(),
  }
}

function createMockMembershipTracker() {
  return {
    getClientsInGroup: vi.fn(),
  }
}

interface Candidate {
  clientId: string
  priority: number
}

describe('MessageRouter', () => {
  let pool: ReturnType<typeof createMockPool>
  let routingTable: ReturnType<typeof createMockRoutingTable>
  let membershipTracker: ReturnType<typeof createMockMembershipTracker>

  beforeEach(() => {
    vi.clearAllMocks()
    pool = createMockPool()
    routingTable = createMockRoutingTable()
    membershipTracker = createMockMembershipTracker()
  })

  describe('sendGroupMsg — 优先级模式', () => {
    it('prefer_master 模式下 master 账号 priority 数值低于 normal', async () => {
      membershipTracker.getClientsInGroup.mockReturnValue(['master', 'normal'])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockImplementation((id: string) => (id === 'master' ? 'master' : 'normal'))
      routingTable.resolve.mockImplementation((_groupId: string, candidates: Candidate[]) => {
        const master = candidates.find((c) => c.clientId === 'master')!
        const normal = candidates.find((c) => c.clientId === 'normal')!
        expect(master.priority).toBeLessThan(normal.priority)
        return 'master'
      })
      sendGroupMsgMock.mockResolvedValue({ ok: true, data: { messageId: 1 } })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await router.sendGroupMsg('123', [])
      expect(routingTable.resolve).toHaveBeenCalledTimes(1)
      expect(debugMock).toHaveBeenCalledWith(
        { groupId: '123', selectedId: 'master', candidateIds: ['master', 'normal'] },
        '群消息路由决策：已选定发送账号',
      )
    })

    it('prefer_normal 模式下 normal 账号 priority 数值低于 master', async () => {
      membershipTracker.getClientsInGroup.mockReturnValue(['master', 'normal'])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockImplementation((id: string) => (id === 'master' ? 'master' : 'normal'))
      routingTable.resolve.mockImplementation((_groupId: string, candidates: Candidate[]) => {
        const master = candidates.find((c) => c.clientId === 'master')!
        const normal = candidates.find((c) => c.clientId === 'normal')!
        expect(normal.priority).toBeLessThan(master.priority)
        return 'normal'
      })
      sendGroupMsgMock.mockResolvedValue({ ok: true, data: { messageId: 1 } })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_normal',
      )

      await router.sendGroupMsg('123', [])
      expect(routingTable.resolve).toHaveBeenCalledTimes(1)
    })

    it('readonly 角色不参与候选，无可用账号时抛出 AppError', async () => {
      membershipTracker.getClientsInGroup.mockReturnValue(['readonly'])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockReturnValue('readonly')

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await expect(router.sendGroupMsg('123', [])).rejects.toThrow('当前群无可用账号发送消息')
      expect(routingTable.resolve).not.toHaveBeenCalled()
    })
  })

  describe('sendPrivateMsg — 优先级模式', () => {
    it('prefer_master 模式下 master 账号 priority 数值低于 normal', async () => {
      pool.getAvailableClients.mockReturnValue([
        { id: 'master', state: 'connected', client: {} },
        { id: 'normal', state: 'connected', client: {} },
      ])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockImplementation((id: string) => (id === 'master' ? 'master' : 'normal'))
      routingTable.resolve.mockImplementation((_key: string, candidates: Candidate[]) => {
        const master = candidates.find((c) => c.clientId === 'master')!
        const normal = candidates.find((c) => c.clientId === 'normal')!
        expect(master.priority).toBeLessThan(normal.priority)
        return 'master'
      })
      sendPrivateMsgMock.mockResolvedValue({ ok: true, data: { messageId: 1 } })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await router.sendPrivateMsg('9999', [])
      expect(routingTable.resolve).toHaveBeenCalledWith('private:9999', expect.any(Array))
      expect(sendPrivateMsgMock).toHaveBeenCalledWith(9999, [])
    })

    it('prefer_normal 模式下 normal 账号 priority 数值低于 master', async () => {
      pool.getAvailableClients.mockReturnValue([
        { id: 'master', state: 'connected', client: {} },
        { id: 'normal', state: 'connected', client: {} },
      ])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockImplementation((id: string) => (id === 'master' ? 'master' : 'normal'))
      routingTable.resolve.mockImplementation((_key: string, candidates: Candidate[]) => {
        const master = candidates.find((c) => c.clientId === 'master')!
        const normal = candidates.find((c) => c.clientId === 'normal')!
        expect(normal.priority).toBeLessThan(master.priority)
        return 'normal'
      })
      sendPrivateMsgMock.mockResolvedValue({ ok: true, data: { messageId: 1 } })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_normal',
      )

      await router.sendPrivateMsg('9999', [])
      expect(routingTable.resolve).toHaveBeenCalledTimes(1)
    })

    it('无在线账号（含"只有 master 不在线、normal 也不在线"场景）时抛出 AppError', async () => {
      pool.getAvailableClients.mockReturnValue([])

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await expect(router.sendPrivateMsg('9999', [])).rejects.toThrow('当前无可用账号发送私聊消息')
      expect(routingTable.resolve).not.toHaveBeenCalled()
    })

    it('只有 normal 账号在线、无 master 账号时仍能正常发送', async () => {
      pool.getAvailableClients.mockReturnValue([{ id: 'normal', state: 'connected', client: {} }])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockReturnValue('normal')
      routingTable.resolve.mockImplementation((_key: string, candidates: Candidate[]) => {
        return candidates[0]!.clientId
      })
      sendPrivateMsgMock.mockResolvedValue({ ok: true, data: { messageId: 1 } })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await router.sendPrivateMsg('9999', [])
      expect(sendPrivateMsgMock).toHaveBeenCalledWith(9999, [])
    })
  })

  describe('setPriorityMode', () => {
    it('更新内存态并清空粘性路由表', () => {
      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      router.setPriorityMode('prefer_normal')

      expect(routingTable.clear).toHaveBeenCalledTimes(1)
    })

    it('切换后 sendGroupMsg 使用新模式重新计算优先级', async () => {
      membershipTracker.getClientsInGroup.mockReturnValue(['master', 'normal'])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockImplementation((id: string) => (id === 'master' ? 'master' : 'normal'))
      sendGroupMsgMock.mockResolvedValue({ ok: true, data: { messageId: 1 } })

      let capturedCandidates: Candidate[] = []
      routingTable.resolve.mockImplementation((_groupId: string, candidates: Candidate[]) => {
        capturedCandidates = candidates
        return candidates[0]!.clientId
      })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )
      router.setPriorityMode('prefer_normal')

      await router.sendGroupMsg('123', [])

      const master = capturedCandidates.find((c) => c.clientId === 'master')!
      const normal = capturedCandidates.find((c) => c.clientId === 'normal')!
      expect(normal.priority).toBeLessThan(master.priority)
    })
  })

  describe('sendGroupSign', () => {
    it('复用 sendGroupMsg 同款候选筛选逻辑，选中账号后调用 GroupApi.sendGroupSign', async () => {
      membershipTracker.getClientsInGroup.mockReturnValue(['acc1'])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockReturnValue('normal')
      routingTable.resolve.mockImplementation((_groupId: string, candidates: Candidate[]) => {
        return candidates[0]!.clientId
      })
      sendGroupSignMock.mockResolvedValue({ ok: true, data: undefined })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await router.sendGroupSign('555')
      expect(sendGroupSignMock).toHaveBeenCalledWith(555)
    })

    it('候选为空时抛出 AppError', async () => {
      membershipTracker.getClientsInGroup.mockReturnValue([])

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await expect(router.sendGroupSign('555')).rejects.toThrow('当前群无可用账号发送消息')
    })
  })

  describe('sendLike', () => {
    it('复用 sendPrivateMsg 同款候选筛选逻辑（任意在线账号），选中后调用 FriendApi.sendLike', async () => {
      pool.getAvailableClients.mockReturnValue([{ id: 'acc1', state: 'connected', client: {} }])
      pool.getClient.mockImplementation((id: string) => ({ id, state: 'connected', client: {} }))
      pool.getClientRole.mockReturnValue('normal')
      routingTable.resolve.mockImplementation((_key: string, candidates: Candidate[]) => {
        return candidates[0]!.clientId
      })
      sendLikeMock.mockResolvedValue({ ok: true, data: undefined })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await router.sendLike('9999', 10)
      expect(sendLikeMock).toHaveBeenCalledWith(9999, 10)
    })

    it('无在线账号时抛出 AppError', async () => {
      pool.getAvailableClients.mockReturnValue([])

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      await expect(router.sendLike('9999', 10)).rejects.toThrow('当前无可用账号发送私聊消息')
    })
  })

  describe('resolveGroupClient', () => {
    it('复用 sendGroupMsg 同款候选筛选与粘性选号，返回选中账号的 NapCatClient', () => {
      const fakeClient = { id: 'acc1' }
      membershipTracker.getClientsInGroup.mockReturnValue(['acc1'])
      pool.getClient.mockImplementation((id: string) => ({
        id,
        state: 'connected',
        client: fakeClient,
      }))
      pool.getClientRole.mockReturnValue('normal')
      routingTable.resolve.mockImplementation((_groupId: string, candidates: Candidate[]) => {
        return candidates[0]!.clientId
      })

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      const client = router.resolveGroupClient('555')
      expect(client).toBe(fakeClient)
    })

    it('候选为空时返回 null，不抛异常', () => {
      membershipTracker.getClientsInGroup.mockReturnValue([])

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      expect(router.resolveGroupClient('555')).toBeNull()
    })
  })

  describe('hasAvailableAccounts', () => {
    it('指定角色时委托给 pool.getAvailableClients(role)', () => {
      pool.getAvailableClients.mockReturnValue([{ id: 'm1', state: 'connected', client: {} }])

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      expect(router.hasAvailableAccounts('master')).toBe(true)
      expect(pool.getAvailableClients).toHaveBeenCalledWith('master')
    })

    it('无候选时返回 false', () => {
      pool.getAvailableClients.mockReturnValue([])

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      expect(router.hasAvailableAccounts('master')).toBe(false)
    })

    it('不传 role 时查询任意角色', () => {
      pool.getAvailableClients.mockReturnValue([{ id: 'n1', state: 'connected', client: {} }])

      const router = new MessageRouter(
        pool as never,
        routingTable as never,
        membershipTracker as never,
        'prefer_master',
      )

      expect(router.hasAvailableAccounts()).toBe(true)
      expect(pool.getAvailableClients).toHaveBeenCalledWith(undefined)
    })
  })
})
