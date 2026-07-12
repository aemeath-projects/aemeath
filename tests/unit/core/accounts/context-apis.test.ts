import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@aemeath-projects/napcat', () => {
  const MessageApi = vi.fn(function (this: object) {})
  const GroupApi = vi.fn(function (this: object) {})
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
})
