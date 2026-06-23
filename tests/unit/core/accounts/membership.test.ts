import type { GroupApi } from '@aemeath-projects/napcat'
import { describe, it, expect, vi } from 'vitest'

import type { NapCatClientAdapter } from '@/core/accounts/index.js'
import { GroupMembershipTracker } from '@/core/accounts/index.js'

describe('GroupMembershipTracker', () => {
  it('syncFromClient 添加账号到所有群', async () => {
    const tracker = new GroupMembershipTracker()
    const mockAdapter = {
      id: 'bot-100',
      client: {},
    } as unknown as NapCatClientAdapter
    const mockGroupApi = {
      getGroupList: vi.fn().mockResolvedValue({
        ok: true,
        data: [{ groupId: 1n }, { groupId: 2n }],
      }),
    }

    await tracker.syncFromClient(mockAdapter, mockGroupApi as unknown as GroupApi)
    expect(tracker.getClientsInGroup(1n)).toContain('bot-100')
    expect(tracker.getClientsInGroup(2n)).toContain('bot-100')
  })

  it('removeClient 从所有群移除该账号', async () => {
    const tracker = new GroupMembershipTracker()
    tracker._addToGroup(1n, 'bot-100')
    tracker._addToGroup(2n, 'bot-100')
    tracker.removeClient('bot-100')
    expect(tracker.getClientsInGroup(1n)).not.toContain('bot-100')
  })

  it('getClientsInGroup 对未知群返回空数组', () => {
    const tracker = new GroupMembershipTracker()
    expect(tracker.getClientsInGroup(999n)).toEqual([])
  })
})
