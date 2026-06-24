/**
 * MessageRouter —— 多账号消息发送路由器。
 *
 * 常规消息：通过 RoutingTable（PriorityStickyStrategy）选择账号。
 * 管理员通知：强制走主账号。
 */
import type { ClientPool, RoutingTable } from '@aemeath-projects/exostrider/pool'
import { MessageApi } from '@aemeath-projects/napcat'
import type { NapCatClient, Result } from '@aemeath-projects/napcat'
import type { MessageSegment, AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { GroupBotRegistry } from './group-bot-registry.js'
import type { AccountRole } from './roles.js'

import { AppError } from '@/core/errors.js'

export class MessageRouter {
  constructor(
    private readonly pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>,
    private readonly routingTable: RoutingTable<bigint>,
    private readonly membershipTracker: GroupBotRegistry,
  ) {}

  /** 常规群消息发送 —— 走路由策略（sticky + 优先级）。 */
  async sendGroupMsg(
    groupId: bigint,
    message: MessageSegment[],
  ): Promise<Result<{ messageId: number }>> {
    const masterAndNormalRoles: AccountRole[] = ['master', 'normal']

    const availableIds = this.membershipTracker.getClientsInGroup(groupId)
    const candidates = availableIds
      .map((id) => this.pool.getClient(id))
      .filter((c): c is NonNullable<typeof c> => c?.state === 'connected')
      .map((c) => {
        const roleDef = this.pool.getClientsByRole('master').some((m) => m.id === c.id)
          ? { role: 'master' as AccountRole, priority: 0 }
          : { role: 'normal' as AccountRole, priority: 10 }
        return { clientId: c.id, ...roleDef }
      })
      .filter((c) => masterAndNormalRoles.includes(c.role))

    if (candidates.length === 0) {
      throw new AppError(-1, '当前群无可用账号发送消息', 503)
    }

    const selectedId = this.routingTable.resolve(groupId, candidates)
    const adapter = this.pool.getClient(selectedId)
    if (!adapter) throw new AppError(-1, '路由选择的账号已离线', 503)
    const msgApi = new MessageApi(adapter.client)
    return msgApi.sendGroupMsg(Number(groupId), message)
  }

  /** 管理员通知 —— 强制走主账号发送私聊消息。 */
  async sendAdminMsg(
    adminQq: bigint,
    message: MessageSegment[],
  ): Promise<Result<{ messageId: number }>> {
    const masters = this.pool.getClientsByRole('master')
    const master = masters.find((c) => c.state === 'connected')
    if (!master) throw new AppError(-1, '主账号不在线，无法发送管理员通知', 503)
    const msgApi = new MessageApi(master.client)
    return msgApi.sendPrivateMsg(Number(adminQq), message)
  }
}
