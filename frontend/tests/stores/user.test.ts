/** User Store 单元测试：用户与群聊查询状态管理。 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'

vi.mock('@/apis/user', () => ({
  fetchUsers: vi.fn(),
  fetchUser: vi.fn(),
  fetchUserGroups: vi.fn(),
  fetchGroups: vi.fn(),
  fetchGroup: vi.fn(),
  fetchGroupMembers: vi.fn(),
  fetchSyncStatus: vi.fn(),
  triggerSync: vi.fn(),
  fetchAdmins: vi.fn(),
  setAdmin: vi.fn(),
  removeAdmin: vi.fn(),
  fetchAdminCandidates: vi.fn(),
}))

import * as api from '@/apis/user'

const mockPaginatedUsers = {
  items: [{ qq: 1, nickname: 'Alice', relation: 'friend', groupCount: 0, lastSynced: null }],
  total: 1,
  page: 1,
  pageSize: 20,
  pages: 1,
}
const mockPaginatedGroups = {
  items: [{ groupId: 100, groupName: 'TestGroup', memberCount: 1, maxMemberCount: 200, isActive: true, lastSynced: null }],
  total: 1,
  page: 1,
  pageSize: 20,
  pages: 1,
}
const mockPaginatedMembers = {
  items: [{ qq: 1, nickname: 'Alice', card: '', role: 'member', relation: 'friend', joinTime: 0, lastActiveTime: 0, title: '', level: '' }],
  total: 1,
  page: 1,
  pageSize: 20,
  pages: 1,
}
const mockUserDetail = { qq: 1, nickname: 'Alice', relation: 'friend', groupCount: 1, lastSynced: null }
const mockSyncStatus = {
  lastSyncTime: '2024-01-01T00:00:00Z',
  durationSeconds: null,
  status: 'idle',
  usersSynced: 0,
  groupsSynced: 0,
  membershipsSynced: 0,
}

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /* 初始状态 */

  describe('初始状态', () => {
    it('users 初始为空分页结构', () => {
      const store = useUserStore()
      expect(store.users.items).toEqual([])
      expect(store.users.total).toBe(0)
    })

    it('usersLoading 初始为 false', () => {
      const store = useUserStore()
      expect(store.usersLoading).toBe(false)
    })

    it('currentUser 初始为 null', () => {
      const store = useUserStore()
      expect(store.currentUser).toBeNull()
    })

    it('groups 初始为空分页结构', () => {
      const store = useUserStore()
      expect(store.groups.items).toEqual([])
    })

    it('syncStatus 初始为 null', () => {
      const store = useUserStore()
      expect(store.syncStatus).toBeNull()
    })

    it('admins 初始为空数组', () => {
      const store = useUserStore()
      expect(store.admins).toEqual([])
    })
  })

  /* loadUsers() */

  describe('loadUsers()', () => {
    it('成功时更新 users', async () => {
      vi.mocked(api.fetchUsers).mockResolvedValue(mockPaginatedUsers)
      const store = useUserStore()

      await store.loadUsers({})

      expect(store.users).toEqual(mockPaginatedUsers)
    })

    it('加载过程中 usersLoading 为 true，结束后为 false', async () => {
      let resolve!: (v: typeof mockPaginatedUsers) => void
      vi.mocked(api.fetchUsers).mockReturnValue(
        new Promise((r) => {
          resolve = r
        }),
      )
      const store = useUserStore()

      const p = store.loadUsers({})
      expect(store.usersLoading).toBe(true)
      resolve(mockPaginatedUsers)
      await p
      expect(store.usersLoading).toBe(false)
    })

    it('API 抛出异常时 usersLoading 仍恢复为 false', async () => {
      vi.mocked(api.fetchUsers).mockRejectedValue(new Error('网络错误'))
      const store = useUserStore()

      await expect(store.loadUsers({})).rejects.toThrow()
      expect(store.usersLoading).toBe(false)
    })
  })

  /* loadUser() */

  describe('loadUser()', () => {
    it('成功时更新 currentUser', async () => {
      vi.mocked(api.fetchUser).mockResolvedValue(mockUserDetail)
      const store = useUserStore()

      await store.loadUser(1)

      expect(store.currentUser).toEqual(mockUserDetail)
    })

    it('失败时 currentUser 被设为 null 并重新抛出错误', async () => {
      vi.mocked(api.fetchUser).mockRejectedValue(new Error('404'))
      const store = useUserStore()
      store.currentUser = mockUserDetail

      await expect(store.loadUser(1)).rejects.toThrow('加载用户详情失败')
      expect(store.currentUser).toBeNull()
    })
  })

  /* loadGroups() */

  describe('loadGroups()', () => {
    it('成功时更新 groups', async () => {
      vi.mocked(api.fetchGroups).mockResolvedValue(mockPaginatedGroups)
      const store = useUserStore()

      await store.loadGroups({})

      expect(store.groups).toEqual(mockPaginatedGroups)
    })

    it('加载过程中 groupsLoading 为 true，结束后为 false', async () => {
      let resolve!: (v: typeof mockPaginatedGroups) => void
      vi.mocked(api.fetchGroups).mockReturnValue(
        new Promise((r) => {
          resolve = r
        }),
      )
      const store = useUserStore()

      const p = store.loadGroups({})
      expect(store.groupsLoading).toBe(true)
      resolve(mockPaginatedGroups)
      await p
      expect(store.groupsLoading).toBe(false)
    })
  })

  /* loadGroupMembers() */

  describe('loadGroupMembers()', () => {
    it('成功时更新 groupMembers', async () => {
      vi.mocked(api.fetchGroupMembers).mockResolvedValue(mockPaginatedMembers)
      const store = useUserStore()

      await store.loadGroupMembers(100, {})

      expect(store.groupMembers).toEqual(mockPaginatedMembers)
    })

    it('加载过程中 membersLoading 为 true，结束后为 false', async () => {
      let resolve!: (v: typeof mockPaginatedMembers) => void
      vi.mocked(api.fetchGroupMembers).mockReturnValue(
        new Promise((r) => {
          resolve = r
        }),
      )
      const store = useUserStore()

      const p = store.loadGroupMembers(100, {})
      expect(store.membersLoading).toBe(true)
      resolve(mockPaginatedMembers)
      await p
      expect(store.membersLoading).toBe(false)
    })
  })

  /* loadSyncStatus() */

  describe('loadSyncStatus()', () => {
    it('成功时更新 syncStatus', async () => {
      vi.mocked(api.fetchSyncStatus).mockResolvedValue(mockSyncStatus)
      const store = useUserStore()

      await store.loadSyncStatus()

      expect(store.syncStatus).toEqual(mockSyncStatus)
    })
  })

  /* doSync() */

  describe('doSync()', () => {
    it('调用 triggerSync 并在完成后 syncLoading 恢复为 false', async () => {
      vi.mocked(api.triggerSync).mockResolvedValue(undefined)
      vi.mocked(api.fetchSyncStatus).mockResolvedValue(mockSyncStatus)
      const store = useUserStore()

      await store.doSync()

      expect(api.triggerSync).toHaveBeenCalledOnce()
      expect(store.syncLoading).toBe(false)
    })

    it('triggerSync 失败时 syncLoading 仍恢复为 false', async () => {
      vi.mocked(api.triggerSync).mockRejectedValue(new Error('同步失败'))
      const store = useUserStore()

      await expect(store.doSync()).rejects.toThrow()
      expect(store.syncLoading).toBe(false)
    })
  })

  /* loadAdmins() / setAdmin() / unsetAdmin() */

  describe('御者操作', () => {
    const mockAdmins = [{ qq: 1, nickname: 'Alice', relation: 'friend', groupCount: 0, lastSynced: null }]

    it('loadAdmins() 成功时更新 admins', async () => {
      vi.mocked(api.fetchAdmins).mockResolvedValue(mockAdmins)
      const store = useUserStore()

      await store.loadAdmins()

      expect(store.admins).toEqual(mockAdmins)
    })

    it('setAdmin() 调用 api.setAdmin 后刷新 admins', async () => {
      vi.mocked(api.setAdmin).mockResolvedValue(undefined)
      vi.mocked(api.fetchAdmins).mockResolvedValue(mockAdmins)
      const store = useUserStore()

      await store.setAdmin(1)

      expect(api.setAdmin).toHaveBeenCalledWith(1)
      expect(store.admins).toEqual(mockAdmins)
    })

    it('unsetAdmin() 调用 removeAdmin 后刷新 admins', async () => {
      vi.mocked(api.removeAdmin).mockResolvedValue(undefined)
      vi.mocked(api.fetchAdmins).mockResolvedValue([])
      const store = useUserStore()

      await store.unsetAdmin()

      expect(api.removeAdmin).toHaveBeenCalledWith()
      expect(store.admins).toEqual([])
    })

    it('loadAdminCandidates() 成功时更新 adminCandidates', async () => {
      const mockCandidates = [{ qq: 111, nickname: '好友甲' }]
      vi.mocked(api.fetchAdminCandidates).mockResolvedValue(mockCandidates)
      const store = useUserStore()

      await store.loadAdminCandidates()

      expect(store.adminCandidates).toEqual(mockCandidates)
    })
  })

  /* ID 解析缓存 */

  describe('getUserName() / getGroupName()', () => {
    it('缓存未命中时返回 QQ 号字符串', () => {
      const store = useUserStore()
      expect(store.getUserName(12345)).toBe('12345')
    })

    it('缓存未命中时返回群号字符串', () => {
      const store = useUserStore()
      expect(store.getGroupName(100)).toBe('100')
    })

    it('clearCache() 清空缓存后 getUserName 返回 ID 字符串', () => {
      const store = useUserStore()
      store.clearCache()
      expect(store.getUserName(1)).toBe('1')
    })
  })

  /* loadSessionData() */

  describe('loadSessionData()', () => {
    it('成功时更新 sessionGroups 和 sessionUsers', async () => {
      vi.mocked(api.fetchGroups).mockResolvedValue(mockPaginatedGroups)
      vi.mocked(api.fetchUsers).mockResolvedValue(mockPaginatedUsers)
      const store = useUserStore()

      await store.loadSessionData()

      expect(store.sessionGroups).toEqual(mockPaginatedGroups.items)
      expect(store.sessionUsers).toEqual(mockPaginatedUsers.items)
    })

    it('API 失败时静默处理，sessionLoading 恢复为 false', async () => {
      vi.mocked(api.fetchGroups).mockRejectedValue(new Error('网络错误'))
      vi.mocked(api.fetchUsers).mockRejectedValue(new Error('网络错误'))
      const store = useUserStore()

      await store.loadSessionData()

      expect(store.sessionLoading).toBe(false)
    })
  })
})
