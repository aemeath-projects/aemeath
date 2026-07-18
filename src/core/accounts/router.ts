/**
 * MessageRouter —— 多账号消息发送路由器，是唯一实现"多账号路由/优先级/粘性
 * 选路"逻辑的基础设施层。
 *
 * 常规消息：通过 RoutingTable（PriorityStickyStrategy）选择账号，优先级由 priorityMode 驱动。
 * 管理员通知：强制走主账号。
 *
 * 路由选择是 sticky + 优先级：同一 groupId/`private:{userId}` 第一次选定账号后
 * 会一直"粘住"该账号，直到它离线才 failover 并重新粘住新账号——不是每次随机
 * 挑选，同一群/同一用户的多次消息会稳定来自同一个账号。
 *
 * `dispatch/adapter.ts` 里的 `MsgApi`（`ctx.apis.msgApi`）是本类的事件级门面，
 * 两者不是平行的两套发信机制，关系说明见该文件顶部注释。
 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { ClientPool, RoutingTable } from '@aemeath-projects/exostrider/pool'
import type { NapCatClient, Result } from '@aemeath-projects/napcat'
import type { MessageSegment, AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { GroupBotRegistry } from './group-bot-registry.js'
import { createMessageApi, createGroupApi, createFriendApi } from './napcat-ports.js'
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
    const msgApi = createMessageApi(adapter.client)
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
    const msgApi = createMessageApi(adapter.client)
    return msgApi.sendPrivateMsg(Number(userId), message)
  }

  /** 群签到 —— 复用 sendGroupMsg 同款路由逻辑（候选来自 GroupBotRegistry 的群成员关系）。 */
  async sendGroupSign(groupId: string): Promise<Result<void>> {
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
      log.error({ groupId, availableIds }, '当前群无可用账号执行签到：候选账号列表为空')
      throw new AppError(-1, '当前群无可用账号发送消息', 503)
    }

    const selectedId = this.routingTable.resolve(groupId, candidates)
    const adapter = this.pool.getClient(selectedId)
    if (!adapter) throw new AppError(-1, '路由选择的账号已离线', 503)
    const groupApi = createGroupApi(adapter.client)
    return groupApi.sendGroupSign(Number(groupId))
  }

  /**
   * 只选账号不发消息——为 ctx.apis.groupApi 提供与 sendGroupMsg 一致的账号选择结果，
   * 保证同一次事件里 groupApi 和 msgApi 默认指向同一个 bot。候选为空时返回 null
   * 而不是抛异常，因为这个方法会在每次构建 ContextApis 时调用，不能让事件处理
   * 流程因为"暂时没有候选"而中断。
   */
  resolveGroupClient(groupId: string): NapCatClient | null {
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

    if (candidates.length === 0) return null

    const selectedId = this.routingTable.resolve(groupId, candidates)
    const adapter = this.pool.getClient(selectedId)
    return adapter?.client ?? null
  }

  /** 点赞 —— 复用 sendPrivateMsg 同款路由逻辑（候选为任意在线 master/normal 账号）。 */
  async sendLike(userId: string, times: number): Promise<Result<void>> {
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
      log.error({ userId }, '当前无可用账号执行点赞：候选账号列表为空')
      throw new AppError(-1, '当前无可用账号发送私聊消息', 503)
    }

    const selectedId = this.routingTable.resolve(`private:${userId}`, candidates)
    const adapter = this.pool.getClient(selectedId)
    if (!adapter) throw new AppError(-1, '路由选择的账号已离线', 503)
    const friendApi = createFriendApi(adapter.client)
    return friendApi.sendLike(Number(userId), times)
  }

  /** 管理员通知 —— 强制走主账号发送私聊消息。 */
  async sendAdminMsg(
    adminQq: string,
    message: MessageSegment[],
  ): Promise<Result<{ messageId: number }>> {
    const masters = this.pool.getClientsByRole('master')
    const master = masters.find((c) => c.state === 'connected')
    if (!master) throw new AppError(-1, '主账号不在线，无法发送管理员通知', 503)
    const msgApi = createMessageApi(master.client)
    return msgApi.sendPrivateMsg(Number(adminQq), message)
  }

  /** 查询是否有指定角色（或任意角色，不传参时）的账号在线。 */
  hasAvailableAccounts(role?: AccountRole): boolean {
    return this.pool.getAvailableClients(role).length > 0
  }
}
