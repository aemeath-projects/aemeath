import { beforeEach, describe, expect, it, vi } from 'vitest'

const GroupApi = vi.fn(function (this: object) {})

vi.mock('@aemeath-projects/napcat', () => {
  const MessageApi = vi.fn(function (this: object) {})
  const FriendApi = vi.fn(function (this: object) {})
  return { MessageApi, GroupApi, FriendApi }
})

const { buildContextApis } = await import('@/core/accounts/context-apis.js')

function createMockPool(clientId: string) {
  return {
    getClient: vi.fn(() => ({ id: clientId, state: 'connected', client: {} })),
  }
}

function createMockRouter() {
  return {
    sendGroupMsg: vi.fn((_groupId: string, _message: unknown[]) =>
      Promise.resolve({ ok: true, data: { messageId: 1 } }),
    ),
    sendPrivateMsg: vi.fn((_userId: string, _message: unknown[]) =>
      Promise.resolve({ ok: true, data: { messageId: 1 } }),
    ),
    resolveGroupClient: vi.fn().mockReturnValue(null),
  }
}

describe('buildContextApis', () => {
  let pool: ReturnType<typeof createMockPool>
  let router: ReturnType<typeof createMockRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    pool = createMockPool('client-a')
    router = createMockRouter()
  })

  it('msgApi.sendGroupMsg 收到 number 类型 groupId（真实事件的原始类型）时，转发给 MessageRouter 前必须转成 string', async () => {
    const apis = buildContextApis(
      { sourceClientId: 'client-a' } as never,
      router as never,
      pool as never,
    )

    // 真实调用方（OneBotContext._sendImpl）传的是 this.event.groupId，即协议原始 number
    await apis.msgApi.sendGroupMsg(885384767, [{ type: 'text', data: { text: 'hi' } }])

    expect(router.sendGroupMsg).toHaveBeenCalledTimes(1)
    const call = router.sendGroupMsg.mock.calls[0]
    expect(call?.[0]).toBe('885384767')
    expect(typeof call?.[0]).toBe('string')
  })

  it('msgApi.sendPrivateMsg 委托给 router.sendPrivateMsg（不透传到事件源客户端）', async () => {
    const apis = buildContextApis(
      { sourceClientId: 'client-a' } as never,
      router as never,
      pool as never,
    )

    await apis.msgApi.sendPrivateMsg(9999, [])

    expect(router.sendPrivateMsg).toHaveBeenCalledWith('9999', [])
  })

  it('群事件场景下 groupApi 绑定 router.resolveGroupClient 解析出的账号，而非硬绑定事件源客户端', () => {
    const resolvedClient = { id: 'resolved-acc' }
    const sourceClient = { id: 'source-acc' }
    router.resolveGroupClient.mockReturnValue(resolvedClient)
    pool.getClient.mockReturnValue({ id: 'source-acc', state: 'connected', client: sourceClient })
    const aggregated = {
      event: { postType: 'message', messageType: 'group', groupId: 555 },
      sourceClientId: 'source-acc',
      sourceRole: 'normal',
      receivedBy: ['source-acc'],
    }

    buildContextApis(aggregated as never, router as never, pool as never)

    expect(router.resolveGroupClient).toHaveBeenCalledWith('555')
    expect(GroupApi).toHaveBeenCalledWith(resolvedClient)
  })

  it('router.resolveGroupClient 返回 null 时回退到事件源客户端绑定', () => {
    const sourceClient = { id: 'source-acc' }
    router.resolveGroupClient.mockReturnValue(null)
    pool.getClient.mockReturnValue({ id: 'source-acc', state: 'connected', client: sourceClient })
    const aggregated = {
      event: { postType: 'message', messageType: 'group', groupId: 555 },
      sourceClientId: 'source-acc',
      sourceRole: 'normal',
      receivedBy: ['source-acc'],
    }

    buildContextApis(aggregated as never, router as never, pool as never)

    expect(router.resolveGroupClient).toHaveBeenCalledWith('555')
    expect(GroupApi).toHaveBeenCalledWith(sourceClient)
  })
})
