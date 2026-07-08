/**
 * 账号角色定义 —— 实例化 exostrider pool 模块的泛型参数。
 */
import type { RoleDefinition } from '@aemeath-projects/exostrider/pool'

export type AccountRole = 'master' | 'normal' | 'readonly'
export type PriorityMode = 'prefer_master' | 'prefer_normal'

export const ACCOUNT_ROLES: RoleDefinition<AccountRole>[] = [
  { name: 'master', priority: 0 },
  { name: 'normal', priority: 10 },
  { name: 'readonly', priority: 100 },
]

/**
 * 根据优先级模式返回调整后的角色列表（修改 master/normal 的 priority）。
 * prefer_master: master=0, normal=10（默认）
 * prefer_normal: master=10, normal=0（翻转）
 */
export function getRolesForMode(mode: PriorityMode): RoleDefinition<AccountRole>[] {
  if (mode === 'prefer_master') return ACCOUNT_ROLES
  return ACCOUNT_ROLES.map((r) => {
    if (r.name === 'master') return { ...r, priority: 10 }
    if (r.name === 'normal') return { ...r, priority: 0 }
    return r
  })
}
