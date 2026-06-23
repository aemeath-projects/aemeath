/**
 * GroupMembershipTracker —— 维护「群 → 在线账号列表」映射。
 * per-group sticky 路由决策依赖此映射过滤可用候选项。
 */
import type { GroupApi } from '@aemeath-projects/napcat'

import type { NapCatClientAdapter } from './adapter.js'

export class GroupMembershipTracker {
  /** groupId（string）→ Set<clientId> */
  private readonly membership = new Map<string, Set<string>>()

  /** 账号连接后，拉取群列表并初始化成员关系。 */
  async syncFromClient(adapter: NapCatClientAdapter, groupApi: GroupApi): Promise<void> {
    const result = await groupApi.getGroupList()
    if (!result.ok) return
    for (const group of result.data) {
      this._addToGroup(BigInt(group.groupId), adapter.id)
    }
  }

  _addToGroup(groupId: bigint, clientId: string): void {
    const key = String(groupId)
    if (!this.membership.has(key)) this.membership.set(key, new Set())
    this.membership.get(key)?.add(clientId)
  }

  /** 移除账号的所有群关系（账号下线时调用）。 */
  removeClient(clientId: string): void {
    for (const set of this.membership.values()) {
      set.delete(clientId)
    }
  }

  /** 查询某群的可用账号 ID 列表。 */
  getClientsInGroup(groupId: bigint): readonly string[] {
    return [...(this.membership.get(String(groupId)) ?? [])]
  }
}
