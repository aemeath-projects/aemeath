import { beforeEach, describe, expect, it } from 'vitest'

import { FeatureRegistry } from '../../../../src/core/registries/feature-registry.js'
import type { FeatureInfo } from '../../../../src/core/registries/feature-registry.js'
import { PermissionRegistry } from '../../../../src/core/registries/permission-registry.js'

function makeFeatureInfo(overrides: Partial<FeatureInfo> = {}): FeatureInfo {
  return {
    name: 'test',
    displayName: '测试功能',
    description: '',
    defaultEnabled: false,
    system: false,
    admin: false,
    messageScope: 'all',
    mappingType: 'command',
    tags: [],
    parent: null,
    children: [],
    trigger: '',
    ...overrides,
  }
}

describe('PermissionRegistry', () => {
  let featureRegistry: FeatureRegistry

  beforeEach(() => {
    featureRegistry = new FeatureRegistry()
  })

  it('fromFeatureRegistry() 应从 FeatureRegistry 构建权限规则', () => {
    featureRegistry.register(makeFeatureInfo({ name: 'echo', defaultEnabled: true }))
    featureRegistry.register(
      makeFeatureInfo({ name: 'admin-cmd', admin: true, defaultEnabled: false }),
    )
    featureRegistry.register(
      makeFeatureInfo({ name: 'sys-feature', system: true, defaultEnabled: true }),
    )

    const registry = PermissionRegistry.fromFeatureRegistry(featureRegistry)

    expect(registry.has('echo')).toBe(true)
    expect(registry.has('admin-cmd')).toBe(true)
    expect(registry.has('sys-feature')).toBe(true)
  })

  it('isSystem() 应正确判断系统功能', () => {
    featureRegistry.register(makeFeatureInfo({ name: 'regular', system: false }))
    featureRegistry.register(makeFeatureInfo({ name: 'sys', system: true }))

    const registry = PermissionRegistry.fromFeatureRegistry(featureRegistry)

    expect(registry.isSystem('regular')).toBe(false)
    expect(registry.isSystem('sys')).toBe(true)
    expect(registry.isSystem('nonexistent')).toBe(false)
  })

  it('isAdmin() 应正确判断管理员专属功能', () => {
    featureRegistry.register(makeFeatureInfo({ name: 'normal', admin: false }))
    featureRegistry.register(makeFeatureInfo({ name: 'admin-cmd', admin: true }))

    const registry = PermissionRegistry.fromFeatureRegistry(featureRegistry)

    expect(registry.isAdmin('normal')).toBe(false)
    expect(registry.isAdmin('admin-cmd')).toBe(true)
    expect(registry.isAdmin('nonexistent')).toBe(false)
  })

  it('getDefault() 应正确返回默认启用状态', () => {
    featureRegistry.register(makeFeatureInfo({ name: 'disabled', defaultEnabled: false }))
    featureRegistry.register(makeFeatureInfo({ name: 'enabled', defaultEnabled: true }))

    const registry = PermissionRegistry.fromFeatureRegistry(featureRegistry)

    expect(registry.getDefault('disabled')).toBe(false)
    expect(registry.getDefault('enabled')).toBe(true)
    expect(registry.getDefault('nonexistent')).toBe(false)
  })
})
