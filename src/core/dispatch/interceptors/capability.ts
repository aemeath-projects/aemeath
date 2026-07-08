/** CapabilityInterceptor —— 在 handler 执行前将 groupApi 替换为有对应权限的账号 API。 */
import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
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

    // groupId 在 OneBotContext 中为 number，GroupBotRegistry 使用 bigint
    const gid = BigInt(groupId)

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
      await obc.reply('操作失败：群内没有具备所需权限的账号')
      return false
    }

    // 通过 buildGroupApi 工厂方法构建，保持与 buildContextApis 一致的封装
    ctx.apis.groupApi = buildGroupApi(clientAdapter.client)
    return true
  }
}
