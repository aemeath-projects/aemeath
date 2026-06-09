import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Context } from '@/core/framework/context.js'
import { Permission } from '@/core/framework/decorators.js'
import { FeaturePermissionChecker } from '@/core/permission/checker.js'
import type { FeaturePermissionService } from '@/core/permission/main.js'
import type { PersonnelService } from '@/core/personnel/main.js'
import type { PermissionRegistry } from '@/core/registries/permission-registry.js'

/** 创建 mock FeaturePermissionService。 */
function createMockPermissionService() {
  return {
    isGroupEnabled: vi.fn(),
    isGroupFeatureEnabled: vi.fn(),
    isPrivateFeatureAllowed: vi.fn(),
    isEnabled: vi.fn(),
    setGroupPermission: vi.fn(),
    setPrivatePermission: vi.fn(),
    getGroupPermissions: vi.fn(),
    getPrivatePermissions: vi.fn(),
    syncPermissions: vi.fn(),
    syncGroupPermissions: vi.fn(),
    batchSetGroupFeatures: vi.fn(),
    invalidateGroupPermissionCache: vi.fn(),
    getPermissionMatrix: vi.fn(),
    setGroupEnabled: vi.fn(),
  }
}

/** 创建 mock PersonnelService。 */
function createMockPersonnelService() {
  return {
    getAdminQqSet: vi.fn(),
    setAdmin: vi.fn(),
    removeAdmin: vi.fn(),
    getAdmins: vi.fn(),
    getSyncStatus: vi.fn(),
    getUserRelation: vi.fn(),
    upsertUsers: vi.fn(),
    upsertGroups: vi.fn(),
    upsertMemberships: vi.fn(),
    persistSyncData: vi.fn(),
    deactivateStaleGroups: vi.fn(),
    deactivateStateMemberships: vi.fn(),
  }
}

/** 创建 mock PermissionRegistry。 */
function createMockPermissionRegistry() {
  return {
    isSystem: vi.fn(),
    isAdmin: vi.fn(),
    getDefault: vi.fn(),
    has: vi.fn(),
  }
}

/** 创建基础 mock Context（群消息）。 */
function createMockGroupContext(overrides?: {
  userId?: number
  groupId?: number
  handlerComponentName?: string
  handlerMethodName?: string
  handlerPermission?: number
  senderRole?: string
}): Partial<Context> {
  const componentName = overrides?.handlerComponentName ?? 'test_feature'
  const methodName = overrides?.handlerMethodName ?? 'handle'
  const permission = overrides?.handlerPermission ?? Permission.ANYONE

  return {
    userId: overrides?.userId ?? 100,
    groupId: overrides?.groupId ?? 12345,
    isGroupEvent: () => true,
    isPrivateEvent: () => false,
    event: {
      post_type: 'message',
      message_type: 'group',
      group_id: overrides?.groupId ?? 12345,
      user_id: overrides?.userId ?? 100,
      sender: { role: overrides?.senderRole ?? 'member' },
    } as unknown as Context['event'],
    getAttribute: vi.fn().mockReturnValue({
      componentName,
      methodName,
      permission,
    }),
    setAttribute: vi.fn(),
  }
}

/** 创建基础 mock Context（私聊消息）。 */
function createMockPrivateContext(overrides?: {
  userId?: number
  handlerComponentName?: string
  handlerMethodName?: string
  handlerPermission?: number
}): Partial<Context> {
  const componentName = overrides?.handlerComponentName ?? 'test_feature'
  const methodName = overrides?.handlerMethodName ?? 'handle'
  const permission = overrides?.handlerPermission ?? Permission.ANYONE

  return {
    userId: overrides?.userId ?? 200,
    groupId: undefined,
    isGroupEvent: () => false,
    isPrivateEvent: () => true,
    event: {
      post_type: 'message',
      message_type: 'private',
      user_id: overrides?.userId ?? 200,
    } as unknown as Context['event'],
    getAttribute: vi.fn().mockReturnValue({
      componentName,
      methodName,
      permission,
    }),
    setAttribute: vi.fn(),
  }
}

describe('FeaturePermissionChecker', () => {
  let mockPermService: ReturnType<typeof createMockPermissionService>
  let mockPersonnelService: ReturnType<typeof createMockPersonnelService>
  let mockPermRegistry: ReturnType<typeof createMockPermissionRegistry>
  let checker: FeaturePermissionChecker

  beforeEach(() => {
    mockPermService = createMockPermissionService()
    mockPersonnelService = createMockPersonnelService()
    mockPermRegistry = createMockPermissionRegistry()

    checker = new FeaturePermissionChecker(
      mockPermService as unknown as FeaturePermissionService,
      mockPersonnelService as unknown as PersonnelService,
      mockPermRegistry as unknown as PermissionRegistry,
    )
  })

  describe('系统功能快速路径', () => {
    it('系统级功能应当零 IO 直接通过', async () => {
      mockPermRegistry.isSystem.mockReturnValue(true)

      const ctx = createMockGroupContext({ handlerComponentName: 'personnel_sync' })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(true)
      expect(mockPersonnelService.getAdminQqSet).not.toHaveBeenCalled()
      expect(mockPermService.isGroupEnabled).not.toHaveBeenCalled()
    })
  })

  describe('超级管理员绕过', () => {
    it('超级管理员应当绕过所有权限检查', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set([100n]))

      const ctx = createMockGroupContext({ userId: 100 })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(true)
      expect(mockPermService.isGroupEnabled).not.toHaveBeenCalled()
    })
  })

  describe('ADMIN 权限检查', () => {
    it('非管理员访问 ADMIN 功能应当返回 false', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())

      const ctx = createMockGroupContext({
        userId: 999,
        handlerPermission: Permission.ADMIN,
      })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(false)
    })
  })

  describe('群聊权限检查', () => {
    it('群 bot 总开关关闭时应当返回 false', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isGroupEnabled.mockResolvedValue(false)

      const ctx = createMockGroupContext()
      const result = await checker.check(ctx as Context)

      expect(result).toBe(false)
      expect(mockPermService.isGroupEnabled).toHaveBeenCalledWith(12345n)
    })

    it('功能未启用时应当返回 false', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isGroupEnabled.mockResolvedValue(true)
      mockPermService.isGroupFeatureEnabled.mockResolvedValue(false)

      const ctx = createMockGroupContext()
      const result = await checker.check(ctx as Context)

      expect(result).toBe(false)
    })

    it('功能启用且权限为 ANYONE 时应当返回 true', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isGroupEnabled.mockResolvedValue(true)
      mockPermService.isGroupFeatureEnabled.mockResolvedValue(true)

      const ctx = createMockGroupContext({ handlerPermission: Permission.ANYONE })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(true)
    })

    it('GROUP_OWNER 权限 + owner 角色应当返回 true', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isGroupEnabled.mockResolvedValue(true)
      mockPermService.isGroupFeatureEnabled.mockResolvedValue(true)

      const ctx = createMockGroupContext({
        handlerPermission: Permission.GROUP_OWNER,
        senderRole: 'owner',
      })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(true)
    })

    it('GROUP_OWNER 权限 + member 角色应当返回 false', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isGroupEnabled.mockResolvedValue(true)
      mockPermService.isGroupFeatureEnabled.mockResolvedValue(true)

      const ctx = createMockGroupContext({
        handlerPermission: Permission.GROUP_OWNER,
        senderRole: 'member',
      })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(false)
    })

    it('GROUP_ADMIN 权限 + admin 角色应当返回 true', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isGroupEnabled.mockResolvedValue(true)
      mockPermService.isGroupFeatureEnabled.mockResolvedValue(true)

      const ctx = createMockGroupContext({
        handlerPermission: Permission.GROUP_ADMIN,
        senderRole: 'admin',
      })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(true)
    })
  })

  describe('私聊权限检查', () => {
    it('私聊功能启用时应当返回 true', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isPrivateFeatureAllowed.mockResolvedValue(true)

      const ctx = createMockPrivateContext({ userId: 200 })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(true)
      expect(mockPermService.isPrivateFeatureAllowed).toHaveBeenCalledWith(
        'test_feature',
        'test_feature.handle',
        200n,
      )
    })

    it('私聊功能禁用时应当返回 false', async () => {
      mockPermRegistry.isSystem.mockReturnValue(false)
      mockPersonnelService.getAdminQqSet.mockResolvedValue(new Set<bigint>())
      mockPermService.isPrivateFeatureAllowed.mockResolvedValue(false)

      const ctx = createMockPrivateContext({ userId: 200 })
      const result = await checker.check(ctx as Context)

      expect(result).toBe(false)
    })
  })

  describe('handlerMethod 为空时', () => {
    it('没有 handlerMethod 时应当返回 true（直通）', async () => {
      const ctx: Partial<Context> = {
        userId: 100,
        groupId: 12345,
        isGroupEvent: () => true,
        isPrivateEvent: () => false,
        event: { post_type: 'message' } as unknown as Context['event'],
        getAttribute: vi.fn().mockReturnValue(undefined),
        setAttribute: vi.fn(),
      }

      const result = await checker.check(ctx as Context)

      expect(result).toBe(true)
    })
  })
})
