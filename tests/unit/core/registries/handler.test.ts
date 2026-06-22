// tests/unit/core/registries/handler.test.ts
import { HandlerRegistry, type HandlerRegistryData } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect, beforeEach } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class Placeholder {}

/** 构建一个最小化的 HandlerRegistryData 条目 */
function makeEntry(name: string, displayName = ''): HandlerRegistryData {
  return {
    options: {
      name,
      displayName,
      description: '',
      tags: [],
      defaultPriority: 0,
      system: false,
    },
    handlerClass: Placeholder,
    metadata: {},
    methods: [],
    classInterceptors: [],
    settingNodes: [],
  }
}

describe('HandlerRegistry', () => {
  let registry: HandlerRegistry

  beforeEach(() => {
    registry = new HandlerRegistry()
  })

  it('注册 handler 元数据', () => {
    registry.register(makeEntry('echo', '回声'))
    expect(registry.get('echo')).toBeDefined()
    expect(registry.get('echo')!.options.displayName).toBe('回声')
  })

  it('重复注册同名覆盖（exostrider 新版行为）', () => {
    registry.register(makeEntry('x'))
    // 新版允许覆盖注册（不抛出），或者会抛出，视实现
    // 测试覆盖后可以正确获取
    const entry2 = makeEntry('x', 'updated')
    registry.register(entry2)
    // 应取到最新注册的条目
    expect(registry.get('x')!.options.displayName).toBe('updated')
  })

  it('entries 返回所有条目', () => {
    registry.register(makeEntry('a'))
    registry.register(makeEntry('b'))
    expect(registry.entries).toHaveLength(2)
  })

  it('has 返回正确布尔值', () => {
    expect(registry.has('z')).toBe(false)
    registry.register(makeEntry('z'))
    expect(registry.has('z')).toBe(true)
  })

  it('get 不存在的 handler 返回 undefined', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('size 返回正确数量', () => {
    expect(registry.size).toBe(0)
    registry.register(makeEntry('a'))
    expect(registry.size).toBe(1)
  })

  it('clear 清空所有条目', () => {
    registry.register(makeEntry('a'))
    registry.clear()
    expect(registry.size).toBe(0)
  })

  it('unregister 移除指定条目', () => {
    registry.register(makeEntry('foo', 'Foo'))
    registry.unregister('foo')
    expect(registry.has('foo')).toBe(false)
  })
})
