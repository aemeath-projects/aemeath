/**
 * NapCatClientAdapter —— 将 napcat SDK NapCatClient 适配为 exostrider ClientAdapter 接口。
 */
import type { ClientAdapter, ClientState, ClientPool } from '@aemeath-projects/exostrider/pool'
import { NapCatClient, WebSocketTransport, SseTransport, SystemApi } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { Account } from '#prisma/main'

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
            reconnect: { maxRetries: -1 },
          })
        : new SseTransport({
            baseUrl: account.endpoint,
            token: account.token ?? undefined,
            reconnect: { maxRetries: -1 },
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
   * 将 NapCat 客户端事件转发到连接池，同时订阅 close 事件以快速触发路由失效。
   * 必须在 pool.addClient() 之后、connect() 之前调用。
   */
  wireToPool<TRole extends string>(
    pool: ClientPool<NapCatClient, TRole, AnyOneBotEvent>,
    role: TRole,
  ): void {
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
  }
}
