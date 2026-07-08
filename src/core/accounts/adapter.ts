/**
 * NapCatClientAdapter —— 将 napcat SDK NapCatClient 适配为 exostrider ClientAdapter 接口。
 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { ClientAdapter, ClientState, PoolEmitter } from '@aemeath-projects/exostrider/pool'
import { NapCatClient, WebSocketTransport, SseTransport, SystemApi } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { Account } from '#prisma/aemeath'

const log: PinoLogger = getLogger('accounts') as unknown as PinoLogger

/** 重连最大尝试次数：配合默认指数退避参数（1s → 30s），约 5-6 分钟后放弃并触发 giveUp。 */
const MAX_RECONNECT_RETRIES = 10

export class NapCatClientAdapter implements ClientAdapter<NapCatClient> {
  readonly id: string
  readonly client: NapCatClient
  readonly qq: bigint

  private readonly transport: WebSocketTransport | SseTransport

  constructor(account: Account) {
    this.qq = account.qq
    this.id = `bot-${String(account.qq)}`

    this.transport =
      account.transport === 'ws'
        ? new WebSocketTransport({
            url: account.endpoint,
            token: account.token ?? undefined,
            reconnect: { maxRetries: MAX_RECONNECT_RETRIES },
          })
        : new SseTransport({
            baseUrl: account.endpoint,
            token: account.token ?? undefined,
            reconnect: { maxRetries: MAX_RECONNECT_RETRIES },
          })

    this.client = new NapCatClient(this.transport)
  }

  get state(): ClientState {
    switch (this.client.state) {
      case 'connected':
        return 'connected'
      case 'connecting':
        return 'connecting'
      default:
        return 'disconnected'
    }
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect()
  }

  async healthCheck(): Promise<boolean> {
    const api = new SystemApi(this.client)
    const result = await api.getLoginInfo()
    return result.ok
  }

  /**
   * 将 NapCat 客户端事件转发到连接池。
   * 由 ClientPool.addClient 自动调用，无需手动触发。
   */
  wireToPool(pool: PoolEmitter, role: string): void {
    const emit = (event: AnyOneBotEvent) => {
      pool.emitFromClient(this.id, event, role)
    }

    this.client.on('message', emit)
    this.client.on('message_sent', emit)
    this.client.on('notice', emit)
    this.client.on('request', emit)

    // WebSocket 断连时立即通知连接池，无需等待健康检测轮询
    this.client.on('close', () => {
      pool.notifyStateChange(this.id, 'connected', 'disconnected')
    })

    // 指数退避重连彻底放弃后，通知连接池进入 error 状态，触发上层自动禁用账号
    this.client.on('giveUp', () => {
      pool.notifyStateChange(this.id, 'connecting', 'error')
    })

    // 必须监听 error：NapCatClient/WebSocketTransport 在连接失败（如 ECONNREFUSED）时，
    // 除了让 connect() 的 Promise reject 之外，还会额外 emit 一个永久的 'error' 事件。
    // Node.js 对 EventEmitter 的 'error' 事件有特殊语义——零监听器时 emit 会同步抛出，
    // 直接打垮整个进程。这里必须兜底监听并记录日志，状态迁移已由上面的 close 处理。
    this.client.on('error', (err) => {
      log.error({ err, clientId: this.id }, 'NapCat 客户端连接错误')
    })
  }
}
