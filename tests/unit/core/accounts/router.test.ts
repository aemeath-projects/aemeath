import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendGroupMsgMock = vi.fn()
const sendPrivateMsgMock = vi.fn()

vi.mock('@aemeath-projects/napcat', () => {
  const MessageApi = vi.fn(function (this: {
    sendGroupMsg: ReturnType<typeof vi.fn>
    sendPrivateMsg: ReturnType<typeof vi.fn>
  }) {
    this.sendGroupMsg = sendGroupMsgMock
    this.sendPrivateMsg = sendPrivateMsgMock
  })
  return { MessageApi }
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
})
