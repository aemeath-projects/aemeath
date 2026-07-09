import { describe, it, expect, beforeEach } from 'vitest'

import { GroupBotRegistry } from '../../../../src/core/accounts/group-bot-registry.js'

describe('GroupBotRegistry', () => {
  let registry: GroupBotRegistry

  beforeEach(() => {
    registry = new GroupBotRegistry()
  })

  it('setRole 后 getClientsInGroup 返回该账号', () => {
    registry.setRole('100', 'client-A', 'member')
    expect(registry.getClientsInGroup('100')).toContain('client-A')
  })

  it('getCapableClients(group_admin) 返回 admin 和 owner，不返回 member', () => {
    registry.setRole('100', 'client-A', 'member')
    registry.setRole('100', 'client-B', 'admin')
    registry.setRole('100', 'client-C', 'owner')

    const capable = registry.getCapableClients('100', 'group_admin')
    expect(capable).toContain('client-B')
    expect(capable).toContain('client-C')
    expect(capable).not.toContain('client-A')
  })

  it('getCapableClients(group_owner) 只返回 owner', () => {
    registry.setRole('100', 'client-B', 'admin')
    registry.setRole('100', 'client-C', 'owner')

    const capable = registry.getCapableClients('100', 'group_owner')
    expect(capable).toContain('client-C')
    expect(capable).not.toContain('client-B')
  })

  it('removeClient 后该账号从群中消失', () => {
    registry.setRole('100', 'client-A', 'admin')
    registry.removeClient('100', 'client-A')
    expect(registry.getClientsInGroup('100')).not.toContain('client-A')
  })

  it('removeGroup 后整个群记录消失', () => {
    registry.setRole('100', 'client-A', 'admin')
    registry.removeGroup('100')
    expect(registry.getClientsInGroup('100')).toHaveLength(0)
    expect(registry.getCapableClients('100', 'group_admin')).toHaveLength(0)
  })

  it('setRole 可更新已有角色', () => {
    registry.setRole('100', 'client-A', 'member')
    registry.setRole('100', 'client-A', 'admin')
    expect(registry.getCapableClients('100', 'group_admin')).toContain('client-A')
  })

  it('不同群互不影响', () => {
    registry.setRole('100', 'client-A', 'admin')
    expect(registry.getCapableClients('200', 'group_admin')).toHaveLength(0)
  })
})
