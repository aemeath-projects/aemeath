import { beforeEach, describe, expect, it } from 'vitest'

import { FeatureRegistry } from '../../../../src/core/registries/feature-registry.js'
import type { FeatureInfo } from '../../../../src/core/registries/feature-registry.js'

function makeFeatureInfo(overrides: Partial<FeatureInfo> = {}): FeatureInfo {
  return {
    name: 'test',
    displayName: '测试功能',
    description: '用于测试',
    defaultEnabled: false,
    system: false,
    admin: false,
    messageScope: 'all',
    mappingType: 'command',
    tags: [],
    parent: null,
    children: [],
    trigger: '/test',
    ...overrides,
  }
}

describe('FeatureRegistry', () => {
  let registry: FeatureRegistry

  beforeEach(() => {
    registry = new FeatureRegistry()
  })

  it('register() 应将功能添加到注册表', () => {
    const info = makeFeatureInfo({ name: 'echo' })
    registry.register(info)

    expect(registry.has('echo')).toBe(true)
    expect(registry.get('echo')).toEqual(info)
  })

  it('getAll() 应返回所有已注册功能', () => {
    registry.register(makeFeatureInfo({ name: 'a' }))
    registry.register(makeFeatureInfo({ name: 'b' }))
    registry.register(makeFeatureInfo({ name: 'c' }))

    const all = registry.getAll()
    expect(all).toHaveLength(3)
    expect(all.map((f) => f.name).sort()).toEqual(['a', 'b', 'c'])
  })

  it('get() 应返回对应功能，不存在时返回 undefined', () => {
    registry.register(makeFeatureInfo({ name: 'echo' }))

    expect(registry.get('echo')).toBeDefined()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('重复注册同名功能应覆盖', () => {
    const first = makeFeatureInfo({ name: 'echo', displayName: '第一版' })
    const second = makeFeatureInfo({ name: 'echo', displayName: '第二版' })

    registry.register(first)
    registry.register(second)

    expect(registry.get('echo')?.displayName).toBe('第二版')
    expect(registry.size).toBe(1)
  })

  it('size 应正确反映已注册数量', () => {
    expect(registry.size).toBe(0)
    registry.register(makeFeatureInfo({ name: 'a' }))
    expect(registry.size).toBe(1)
    registry.register(makeFeatureInfo({ name: 'b' }))
    expect(registry.size).toBe(2)
  })

  it('has() 应正确判断功能是否存在', () => {
    expect(registry.has('echo')).toBe(false)
    registry.register(makeFeatureInfo({ name: 'echo' }))
    expect(registry.has('echo')).toBe(true)
  })
})
