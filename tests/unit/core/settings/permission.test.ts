import { Permission, handlerRegistry, Handler } from '@aemeath-projects/exostrider/dispatch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OneBotContext as Context } from '@/core/dispatch/index.js'
import { SettingNode } from '@/core/settings/decorators.js'
import type { SettingNodeOptions } from '@/core/settings/decorators.js'
import { SettingsPermissionChecker, buildSchemaMap } from '@/core/settings/index.js'
import type { SettingsService } from '@/core/settings/index.js'
import type { AdminService } from '@/core/user/admin.js'

/* Mock 工厂 */

function createMockSettings(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn((_key: string) => Promise.resolve(overrides[_key] ?? true)),
    resolveEnum: vi.fn(
      (_key: string, label: string) => Permission[label as keyof typeof Permission] ?? 0,
    ),
  } as unknown as SettingsService
}

function createMockAdminService(adminQq: bigint | null = null) {
  return {
    getAdminQq: vi.fn().mockResolvedValue(adminQq),
  } as unknown as AdminService
}

function createGroupContext(
  opts: {
    userId?: number
    groupId?: number
    componentName?: string
    permission?: number
    senderRole?: string
  } = {},
): Partial<Context> {
  return {
    userId: opts.userId ?? 100,
    groupId: opts.groupId ?? 12345,
    event: {
      sender: { role: opts.senderRole ?? 'member' },
    } as unknown as Context['event'],
    getAttribute: vi.fn().mockReturnValue({
      componentName: opts.componentName ?? 'test_feature',
      methodName: 'handle',
      permission: opts.permission ?? Permission.ANYONE,
    }),
    setAttribute: vi.fn(),
  }
}

function createPrivateContext(
  opts: { userId?: number; componentName?: string } = {},
): Partial<Context> {
  return {
    userId: opts.userId ?? 200,
    groupId: undefined,
    event: {} as unknown as Context['event'],
    getAttribute: vi.fn().mockReturnValue({
      componentName: opts.componentName ?? 'test_feature',
      methodName: 'handle',
      permission: Permission.ANYONE,
    }),
    setAttribute: vi.fn(),
  }
}

/* 测试 */

class TestHandler {
  handle(): void {}
}

beforeEach(() => {
  handlerRegistry.clear()
})

/** 注册测试 handler 及 settingNodes */
function registerTestHandler(): void {
  const metadata: Record<symbol, unknown> = {}
  const ctxBase = {
    kind: 'class' as const,
    metadata,
    addInitializer: () => {},
    name: 'TestHandler',
  }
  const nodes: { key: string; options: SettingNodeOptions }[] = [
    { key: 'enabled', options: { type: 'boolean', default: true } },
    {
      key: 'permission',
      options: {
        type: 'enum',
        default: 'ANYONE',
        enumOptions: Permission,
      },
    },
  ]
  for (const node of nodes) {
    SettingNode(node.key, node.options)(TestHandler, ctxBase)
  }
  Handler({ name: 'test_feature', displayName: 'Test Feature' })(TestHandler, ctxBase)
}

function buildChecker(settingsValues: Record<string, unknown> = {}, adminQq: bigint | null = null) {
  registerTestHandler()
  const schemaMap = buildSchemaMap()
  const settings = createMockSettings(settingsValues)
  const adminService = createMockAdminService(adminQq)
  return {
    checker: new SettingsPermissionChecker(settings, adminService, schemaMap),
    settings,
    adminService,
  }
}

describe('system 功能直通', () => {
  it('system 组件跳过所有检查', async () => {
    handlerRegistry.clear()
    // 注册一个 system=true 的 handler
    const metadata: Record<symbol, unknown> = {}
    const ctxBase = {
      kind: 'class' as const,
      metadata,
      addInitializer: () => {},
      name: 'TestHandler',
    }
    Handler({ name: 'sys_feature', displayName: '', system: true })(TestHandler, ctxBase)

    const schemaMap = buildSchemaMap()
    const settings = createMockSettings()
    const adminService = createMockAdminService()
    const checker = new SettingsPermissionChecker(settings, adminService, schemaMap)

    const ctx = createGroupContext({ componentName: 'sys_feature' })
    expect(await checker.check(ctx as Context)).toBe(true)
    expect(adminService.getAdminQq).not.toHaveBeenCalled()
  })
})

describe('御者绕过', () => {
  it('御者无视所有功能开关', async () => {
    const { checker } = buildChecker({ 'bot.enabled': false }, 100n)
    const ctx = createGroupContext({ userId: 100 })
    expect(await checker.check(ctx as Context)).toBe(true)
  })

  it('存在御者但与当前发起者不匹配时不绕过，继续走后续检查', async () => {
    const { checker } = buildChecker({ 'bot.enabled': false }, 999n)
    const ctx = createGroupContext({ userId: 100 })
    expect(await checker.check(ctx as Context)).toBe(false)
  })
})

describe('ADMIN 权限', () => {
  it('非超管访问 ADMIN 功能被拒绝', async () => {
    const { checker } = buildChecker()
    const ctx = createGroupContext({ permission: Permission.ADMIN })
    expect(await checker.check(ctx as Context)).toBe(false)
  })
})

describe('群聊检查链路', () => {
  it('bot.enabled=false 时拒绝所有请求', async () => {
    const { checker } = buildChecker({ 'bot.enabled': false, 'test_feature.enabled': true })
    const ctx = createGroupContext()
    expect(await checker.check(ctx as Context)).toBe(false)
  })

  it('功能 enabled=false 时被拒绝', async () => {
    const { checker } = buildChecker({ 'bot.enabled': true, 'test_feature.enabled': false })
    const ctx = createGroupContext()
    expect(await checker.check(ctx as Context)).toBe(false)
  })

  it('权限配置为 ANYONE 时 member 角色通过', async () => {
    const { checker, settings } = buildChecker({
      'bot.enabled': true,
      'test_feature.enabled': true,
      'test_feature.permission': 'ANYONE',
    })
    vi.mocked(settings.resolveEnum).mockReturnValue(Permission.ANYONE)

    const ctx = createGroupContext({ senderRole: 'member' })
    expect(await checker.check(ctx as Context)).toBe(true)
  })

  it('权限配置为 GROUP_OWNER 时 member 角色被拒绝', async () => {
    const { checker, settings } = buildChecker({
      'bot.enabled': true,
      'test_feature.enabled': true,
      'test_feature.permission': 'GROUP_OWNER',
    })
    vi.mocked(settings.resolveEnum).mockReturnValue(Permission.GROUP_OWNER)

    const ctx = createGroupContext({ senderRole: 'member' })
    expect(await checker.check(ctx as Context)).toBe(false)
  })

  it('权限配置为 GROUP_ADMIN 时 admin 角色通过', async () => {
    const { checker, settings } = buildChecker({
      'bot.enabled': true,
      'test_feature.enabled': true,
      'test_feature.permission': 'GROUP_ADMIN',
    })
    vi.mocked(settings.resolveEnum).mockReturnValue(Permission.GROUP_ADMIN)

    const ctx = createGroupContext({ senderRole: 'admin' })
    expect(await checker.check(ctx as Context)).toBe(true)
  })
})

describe('私聊检查链路', () => {
  it('功能 enabled=true 时通过', async () => {
    const { checker } = buildChecker({ 'test_feature.enabled': true })
    const ctx = createPrivateContext()
    expect(await checker.check(ctx as Context)).toBe(true)
  })

  it('功能 enabled=false 时被拒绝', async () => {
    const { checker } = buildChecker({ 'test_feature.enabled': false })
    const ctx = createPrivateContext()
    expect(await checker.check(ctx as Context)).toBe(false)
  })
})

describe('handlerMethod 缺失', () => {
  it('无 handlerMethod 属性时直通', async () => {
    const { checker } = buildChecker()
    const ctx: Partial<Context> = {
      userId: 100,
      groupId: 12345,
      event: {} as Context['event'],
      getAttribute: vi.fn().mockReturnValue(undefined),
      setAttribute: vi.fn(),
    }
    expect(await checker.check(ctx as Context)).toBe(true)
  })
})
