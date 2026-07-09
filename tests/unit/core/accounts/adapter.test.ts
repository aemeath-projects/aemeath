/**
 * NapCatClientAdapter 单元测试 —— 重点验证 wireToPool 是否为 client 注册了 error 监听器。
 *
 * 背景：NapCatClient/WebSocketTransport 在连接失败（如 ECONNREFUSED）时，除了让
 * connect() 的 Promise reject 之外，还会额外 emit 一个永久的 'error' 事件
 * （transport.on('error', ...) 在 WebSocketTransport.connect() 里是 .on 不是 .once，
 * 且 NapCatClient._setupEventForwarding 会把它转发到 client 自身）。
 * Node.js 对 EventEmitter 的 'error' 事件有特殊语义：emit('error', ...) 时如果零监听器，
 * 会同步 throw，导致整个进程崩溃。之前 wireToPool 只注册了
 * message/message_sent/notice/request/close，唯独没有注册 error，
 * 所以任何真实的网络层连接失败都会打垮整个 Fastify 进程。
 */
import { describe, expect, it, vi } from 'vitest'

import type { Account } from '#prisma/aemeath'

import { NapCatClientAdapter } from '@/core/accounts/adapter.js'

function createMockPool() {
  return {
    emitFromClient: vi.fn(),
    notifyStateChange: vi.fn(),
  }
}

const account: Account = {
  qq: '1739280698',
  nickname: '测试1',
  role: 'master',
  transport: 'ws',
  endpoint: 'ws://127.0.0.1:1',
  token: null,
  isEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('NapCatClientAdapter.wireToPool', () => {
  it('注册 error 监听器后，client 上 emit error 事件不会抛出未捕获异常', () => {
    const adapter = new NapCatClientAdapter(account)
    const pool = createMockPool()

    adapter.wireToPool(pool, 'master')

    expect(() => adapter.client.emit('error', new Error('连接被拒绝'))).not.toThrow()
  })

  it('未调用 wireToPool 时（未加入连接池），emit error 会按 Node 默认行为抛出', () => {
    // 这条用例用来证明"崩溃"确实是 EventEmitter 的零监听器语义，而不是我们凭空想象的
    const adapter = new NapCatClientAdapter(account)

    expect(() => adapter.client.emit('error', new Error('连接被拒绝'))).toThrow()
  })
})

describe('NapCatClientAdapter.wireToPool — giveUp 转发', () => {
  it('client 上 emit giveUp 时通知连接池状态变为 error', () => {
    const adapter = new NapCatClientAdapter(account)
    const pool = createMockPool()

    adapter.wireToPool(pool, 'master')
    adapter.client.emit('giveUp')

    expect(pool.notifyStateChange).toHaveBeenCalledWith(adapter.id, 'connecting', 'error')
  })
})
