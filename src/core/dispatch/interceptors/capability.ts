/**
 * CapabilityInterceptor —— 在 handler 执行前将 groupApi 替换为具备所需权限的账号 API。
 *
 * 职责边界：这里检查的是"Bot 账号"在群内的权限等级（谁能以管理员身份调用 API），
 * 与 FeatureCheckInterceptor 检查"当前用户"是否有权限触发某个功能是两个维度，
 * 不可合并——前者决定用哪个账号发送请求，后者决定要不要处理这条消息。
 */
import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { ClientState } from '@aemeath-projects/exostrider/pool'
import type { NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import { buildGroupApi } from '../adapter.js'
import type { ContextApis } from '../adapter.js'
import type { OneBotContext } from '../context.js'

import type { GroupBotRegistry } from '@/core/accounts/index.js'

interface Pool {
  getClient(id: string): { state: ClientState; client: NapCatClient } | undefined
}

const log: PinoLogger = getLogger('capability-interceptor') as unknown as PinoLogger

export class CapabilityInterceptor implements HandlerInterceptor<AnyOneBotEvent, ContextApis> {
  constructor(
    private readonly registry: GroupBotRegistry,
    private readonly pool: Pool,
  ) {}

  // 接口要求 ctx 类型为 Context<AnyOneBotEvent, ContextApis>（逆变合规）
  // 内部强转为 OneBotContext 以访问 groupId / reply（OneBotContext 是其子类型，安全）
  async preHandle(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    handler: ResolvedHandler,
  ): Promise<boolean> {
    const cap = handler.requiredBotCapability
    if (cap === null) return true

    const obc = ctx as unknown as OneBotContext
    const groupId = obc.groupId
    if (groupId === undefined) return true

    // groupId 在 OneBotContext 中为 number，GroupBotRegistry 使用 string
    const gid = groupId

    // 缓存查找结果，避免对同一 ID 调用两次 getClient
    let clientAdapter: { state: ClientState; client: NapCatClient } | undefined
    for (const id of this.registry.getCapableClients(gid, cap)) {
      const c = this.pool.getClient(id)
      if (c?.state === 'connected') {
        clientAdapter = c
        break
      }
    }

    if (!clientAdapter) {
      log.debug(
        { groupId: gid, capability: cap },
        'CapabilityInterceptor: 群内无具备所需权限的账号',
      )
      await obc.reply('操作失败：群内没有具备所需权限的账号')
      return false
    }

    // 通过 buildGroupApi 工厂方法构建，保持与 buildContextApis 一致的封装
    ctx.apis.groupApi = buildGroupApi(clientAdapter.client)
    return true
  }
}
