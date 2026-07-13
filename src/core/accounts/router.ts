/**
 * MessageRouter —— 多账号消息发送路由器。
 *
 * 常规消息：通过 RoutingTable（PriorityStickyStrategy）选择账号，优先级由 priorityMode 驱动。
 * 管理员通知：强制走主账号。
 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { ClientPool, RoutingTable } from '@aemeath-projects/exostrider/pool'
import { MessageApi } from '@aemeath-projects/napcat'
import type { NapCatClient, Result } from '@aemeath-projects/napcat'
import type { MessageSegment, AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { GroupBotRegistry } from './group-bot-registry.js'
import { getRolesForMode } from './roles.js'
import type { AccountRole, PriorityMode } from './roles.js'

import { AppError } from '@/core/errors.js'

const log: PinoLogger = getLogger('accounts') as unknown as PinoLogger

export class MessageRouter {
  constructor(
    private readonly pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>,
    private readonly routingTable: RoutingTable<string>,
    private readonly membershipTracker: GroupBotRegistry,
    private priorityMode: PriorityMode,
  ) {}

  /** 切换优先级模式：更新内存态并清空粘性路由表，下一次发送即按新优先级重新选号。 */
  setPriorityMode(mode: PriorityMode): void {
    this.priorityMode = mode
    this.routingTable.clear()
  }

  /** 常规群消息发送 —— 走路由策略（sticky + 优先级）。 */
  async sendGroupMsg(
    groupId: string,
    message: MessageSegment[],
  ): Promise<Result<{ messageId: number }>> {
    const masterAndNormalRoles: AccountRole[] = ['master', 'normal']
    const roleDefs = getRolesForMode(this.priorityMode)

    const availableIds = this.membershipTracker.getClientsInGroup(groupId)
    const candidates = availableIds
      .map((id) => this.pool.getClient(id))
      .filter((c): c is NonNullable<typeof c> => c?.state === 'connected')
      .map((c) => ({ clientId: c.id, role: this.pool.getClientRole(c.id) }))
      .filter(
        (c): c is { clientId: string; role: AccountRole } =>
          c.role !== undefined && masterAndNormalRoles.includes(c.role),
      )
      .map((c) => ({
        ...c,
        priority: roleDefs.find((r) => r.name === c.role)?.priority ?? Number.MAX_SAFE_INTEGER,
      }))

    if (candidates.length === 0) {
      log.error(
        {
          groupId,
          availableIds,
          rawStates: availableIds.map((id) => ({
            id,
            state: this.pool.getClient(id)?.state,
            role: this.pool.getClientRole(id),
          })),
        },
        '当前群无可用账号发送消息：候选账号列表为空，附完整诊断信息',
      )
      throw new AppError(-1, '当前群无可用账号发送消息', 503)
    }

    const selectedId = this.routingTable.resolve(groupId, candidates)
    log.debug(
      { groupId, selectedId, candidateIds: candidates.map((c) => c.clientId) },
      '群消息路由决策：已选定发送账号',
    )
    const adapter = this.pool.getClient(selectedId)
    if (!adapter) throw new AppError(-1, '路由选择的账号已离线', 503)
    const msgApi = new MessageApi(adapter.client)
    return msgApi.sendGroupMsg(Number(groupId), message)
  }

  /**
   * 通用私聊消息发送 —— 走路由策略（sticky + 优先级），面向渲染回复等无强绑定场景
   * （例如 /help 图片回复）。与 sendGroupMsg 不同，候选账号不依赖 GroupBotRegistry
   * 的群成员关系，而是取当前所有在线的 master/normal 账号。
   */
  async sendPrivateMsg(
    userId: string,
    message: MessageSegment[],
  ): Promise<Result<{ messageId: number }>> {
    const masterAndNormalRoles: AccountRole[] = ['master', 'normal']
    const roleDefs = getRolesForMode(this.priorityMode)

    const candidates = this.pool
      .getAvailableClients()
      .map((c) => ({ clientId: c.id, role: this.pool.getClientRole(c.id) }))
      .filter(
        (c): c is { clientId: string; role: AccountRole } =>
          c.role !== undefined && masterAndNormalRoles.includes(c.role),
      )
      .map((c) => ({
        ...c,
        priority: roleDefs.find((r) => r.name === c.role)?.priority ?? Number.MAX_SAFE_INTEGER,
      }))

    if (candidates.length === 0) {
      log.error({ userId }, '当前无可用账号发送私聊消息：候选账号列表为空')
      throw new AppError(-1, '当前无可用账号发送私聊消息', 503)
    }

    const selectedId = this.routingTable.resolve(`private:${userId}`, candidates)
    const adapter = this.pool.getClient(selectedId)
    if (!adapter) throw new AppError(-1, '路由选择的账号已离线', 503)
    const msgApi = new MessageApi(adapter.client)
    return msgApi.sendPrivateMsg(Number(userId), message)
  }

  /** 管理员通知 —— 强制走主账号发送私聊消息。 */
  async sendAdminMsg(
    adminQq: string,
    message: MessageSegment[],
  ): Promise<Result<{ messageId: number }>> {
    const masters = this.pool.getClientsByRole('master')
    const master = masters.find((c) => c.state === 'connected')
    if (!master) throw new AppError(-1, '主账号不在线，无法发送管理员通知', 503)
    const msgApi = new MessageApi(master.client)
    return msgApi.sendPrivateMsg(Number(adminQq), message)
  }
}
