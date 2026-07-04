// tests/unit/core/settings/decorators.test.ts
import { Handler, handlerRegistry } from '@aemeath-projects/exostrider/dispatch'
import { beforeEach, describe, expect, it } from 'vitest'

import { SettingNode, collectSettingNodes } from '@/core/settings/decorators.js'
import type { SettingNodeOptions } from '@/core/settings/decorators.js'

beforeEach(() => {
  handlerRegistry.clear()
})

class TestHandler {
  handle(): void {}
}

/** 手动模拟装饰器上下文，应用本地 @SettingNode + exostrider @Handler，使其注册到 handlerRegistry。 */
function registerHandlerWithSettings(
  handlerName: string,
  settingNodes: { key: string; options: SettingNodeOptions }[],
): void {
  const metadata: Record<symbol, unknown> = {}
  const classCtxBase = {
    kind: 'class' as const,
    metadata,
    addInitializer: () => {},
    name: 'TestHandler',
  }

  for (const node of settingNodes) {
    SettingNode(node.key, node.options)(TestHandler, classCtxBase)
  }

  Handler({ name: handlerName, displayName: `Test ${handlerName}` })(TestHandler, classCtxBase)
}

describe('SettingNode + collectSettingNodes', () => {
  it('注册 boolean 类型配置项', () => {
    registerHandlerWithSettings('feature', [
      { key: 'enabled', options: { type: 'boolean', default: true, description: '开关' } },
    ])

    const entry = handlerRegistry.get('feature')!
    const nodes = collectSettingNodes(entry)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.key).toBe('feature.enabled')
    expect(nodes[0]!.options.type).toBe('boolean')
    expect(nodes[0]!.options.default).toBe(true)
  })

  it('注册 enum 类型配置项（含 enumOptions）', () => {
    const permission = { ANYONE: 0, ADMIN: 100 }
    registerHandlerWithSettings('feature2', [
      {
        key: 'permission',
        options: {
          type: 'enum',
          default: 'ANYONE',
          enumOptions: permission,
          description: '权限等级',
        },
      },
    ])

    const entry = handlerRegistry.get('feature2')!
    const nodes = collectSettingNodes(entry)
    expect(nodes[0]!.options.enumOptions).toEqual(permission)
    expect(nodes[0]!.options.default).toBe('ANYONE')
  })

  it('同一 handler 可叠加多个 SettingNode', () => {
    registerHandlerWithSettings('feature3', [
      { key: 'enabled', options: { type: 'boolean', default: true } },
      {
        key: 'permission',
        options: { type: 'enum', default: 'ANYONE', enumOptions: { ANYONE: 0 } },
      },
    ])

    const entry = handlerRegistry.get('feature3')!
    expect(collectSettingNodes(entry)).toHaveLength(2)
  })

  it('没有 SettingNode 声明的 handler 返回空数组', () => {
    const metadata: Record<symbol, unknown> = {}
    Handler({ name: 'bare_feature', displayName: 'Bare' })(TestHandler, {
      kind: 'class',
      metadata,
      addInitializer: () => {},
      name: 'TestHandler',
    })

    const entry = handlerRegistry.get('bare_feature')!
    expect(collectSettingNodes(entry)).toEqual([])
  })

  it('不同 handler 的元数据互不泄漏', () => {
    registerHandlerWithSettings('isolated_a', [
      { key: 'enabled', options: { type: 'boolean', default: true } },
    ])

    const metadataB: Record<symbol, unknown> = {}
    Handler({ name: 'isolated_b', displayName: 'B' })(TestHandler, {
      kind: 'class',
      metadata: metadataB,
      addInitializer: () => {},
      name: 'TestHandler',
    })

    const entryA = handlerRegistry.get('isolated_a')!
    const entryB = handlerRegistry.get('isolated_b')!
    expect(collectSettingNodes(entryA)).toHaveLength(1)
    expect(collectSettingNodes(entryB)).toHaveLength(0)
  })

  it('子类通过原型链继承父类 metadata 时不会污染父类的 SettingNode 数组', () => {
    class BaseHandler {
      handle(): void {}
    }
    class SubHandler extends BaseHandler {}

    // 模拟 TC39 装饰器规范：子类的 metadata 对象以父类 metadata 为原型。
    const baseMetadata: Record<symbol, unknown> = {}
    const baseCtx = {
      kind: 'class' as const,
      metadata: baseMetadata,
      addInitializer: () => {},
      name: 'BaseHandler',
    } as ClassDecoratorContext

    SettingNode('enabled', { type: 'boolean', default: true })(BaseHandler, baseCtx)
    Handler({ name: 'base_feature', displayName: 'Base' })(BaseHandler, baseCtx)

    const subMetadata = Object.create(baseMetadata) as Record<symbol, unknown>
    const subCtx = {
      kind: 'class' as const,
      metadata: subMetadata,
      addInitializer: () => {},
      name: 'SubHandler',
    } as ClassDecoratorContext

    // 子类新增一个自己的 SettingNode，此时 subMetadata 上并无自有 SETTING_NODES 属性，
    // 只能通过原型链读到父类的数组——修复前的实现会直接 push 到父类数组上。
    SettingNode('sub_only', { type: 'boolean', default: false })(SubHandler, subCtx)
    Handler({ name: 'sub_feature', displayName: 'Sub' })(SubHandler, subCtx)

    const baseEntry = handlerRegistry.get('base_feature')!
    const subEntry = handlerRegistry.get('sub_feature')!

    // 父类应仍然只有自己声明的那一个配置项，不应被子类的声明污染。
    expect(collectSettingNodes(baseEntry)).toHaveLength(1)
    expect(collectSettingNodes(baseEntry)[0]!.key).toBe('base_feature.enabled')

    // 子类应同时看到继承自父类的配置项和自己新增的配置项。
    const subNodes = collectSettingNodes(subEntry)
    expect(subNodes).toHaveLength(2)
    expect(subNodes.map((n) => n.key).sort()).toEqual([
      'sub_feature.enabled',
      'sub_feature.sub_only',
    ])
  })
})
