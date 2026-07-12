/** GroupBotRegistry —— 维护 bot 账号在各群内的角色，支持能力查询。 */

import type { BotCapability } from '@aemeath-projects/exostrider/dispatch'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

const log: PinoLogger = getLogger('accounts') as unknown as PinoLogger

/** Bot 在群内的角色。 */
export type GroupBotRole = 'member' | 'admin' | 'owner'

/** 维护 bot 账号在各群内的角色，并提供能力查询。 */
export class GroupBotRegistry {
  /** groupId → clientId → role */
  private readonly _roles = new Map<string, Map<string, GroupBotRole>>()

  /** 设置或更新指定群内某 bot 账号的角色。 */
  setRole(groupId: string, clientId: string, role: GroupBotRole): void {
    let group = this._roles.get(groupId)
    if (!group) {
      group = new Map()
      this._roles.set(groupId, group)
    }
    group.set(clientId, role)
    log.info({ groupId, clientId, role }, 'GroupBotRegistry.setRole')
  }

  /** 从指定群中移除某 bot 账号的角色记录。 */
  removeClient(groupId: string, clientId: string): void {
    this._roles.get(groupId)?.delete(clientId)
    log.warn({ groupId, clientId }, 'GroupBotRegistry.removeClient')
  }

  /** 移除整个群的所有角色记录。 */
  removeGroup(groupId: string): void {
    this._roles.delete(groupId)
    log.warn({ groupId }, 'GroupBotRegistry.removeGroup')
  }

  /** 返回指定群内所有已注册 bot 账号的 clientId 列表。 */
  getClientsInGroup(groupId: string): string[] {
    const clients = [...(this._roles.get(groupId)?.keys() ?? [])]
    if (clients.length === 0) {
      log.warn(
        {
          groupId,
          totalGroupsTracked: this._roles.size,
          allTrackedGroupIds: [...this._roles.keys()],
        },
        'GroupBotRegistry.getClientsInGroup 未查到任何账号',
      )
    }
    return clients
  }

  /**
   * 返回指定群内满足给定能力要求的 bot 账号列表。
   * - `group_admin`：admin 和 owner 均满足
   * - `group_owner`：仅 owner 满足
   */
  getCapableClients(groupId: string, capability: BotCapability): string[] {
    const group = this._roles.get(groupId)
    if (!group) return []
    const result: string[] = []
    for (const [clientId, role] of group) {
      if (capability === 'group_admin' && (role === 'admin' || role === 'owner')) {
        result.push(clientId)
      } else if (capability === 'group_owner' && role === 'owner') {
        result.push(clientId)
      }
    }
    return result
  }
}
