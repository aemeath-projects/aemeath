// tests/unit/core/settings/decorators.test.ts
// 旧版 SettingNode/settingNodeRegistry 已不存在，settings 配置节点现通过
// exostrider @SettingNode 装饰器 + HandlerRegistry 注册。
// 此文件改为测试 buildSchemaMap 从 handlerRegistry 正确读取 settingNodes。
import {
  Permission,
  handlerRegistry,
  SettingNode,
  Handler,
  type SettingNodeEntry,
} from '@aemeath-projects/exostrider/dispatch'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildSchemaMap } from '@/core/settings/index.js'

beforeEach(() => {
  handlerRegistry.clear()
})

class TestHandler {
  handle(): void {}
}

/**
 * 通过手动模拟装饰器上下文来应用 @Handler + @SettingNode，
 * 使其注册到 handlerRegistry。
 */
function registerHandlerWithSettings(
  handlerName: string,
  settingNodes: { key: string; options: SettingNodeEntry['options'] }[],
): void {
  const metadata: Record<symbol, unknown> = {}
  const classCtxBase = {
    kind: 'class' as const,
    metadata,
    addInitializer: () => {},
  }

  // 手动应用 @SettingNode 装饰器
  for (const node of settingNodes) {
    SettingNode(node.key, node.options)(TestHandler, { ...classCtxBase, name: 'TestHandler' })
  }

  // 手动应用 @Handler 装饰器
  const handlerCtx = {
    ...classCtxBase,
    name: 'TestHandler',
  } as unknown as ClassDecoratorContext

  Handler({ name: handlerName, displayName: `Test ${handlerName}` })(TestHandler, handlerCtx)
}

describe('SettingNode 通过 HandlerRegistry 注册', () => {
  it('注册 boolean 类型配置项', () => {
    registerHandlerWithSettings('feature', [
      { key: 'enabled', options: { type: 'boolean', default: true, description: '开关' } },
    ])

    const entry = handlerRegistry.get('feature')
    expect(entry).toBeDefined()
    expect(entry!.settingNodes).toHaveLength(1)
    expect(entry!.settingNodes[0]!.key).toBe('feature.enabled')
    expect(entry!.settingNodes[0]!.options.type).toBe('boolean')
    expect(entry!.settingNodes[0]!.options.default).toBe(true)
  })

  it('注册 enum 类型配置项（含 enumOptions）', () => {
    registerHandlerWithSettings('feature2', [
      {
        key: 'permission',
        options: {
          type: 'enum',
          default: 'ANYONE',
          enumOptions: Permission,
          description: '权限等级',
        },
      },
    ])

    const entry = handlerRegistry.get('feature2')
    expect(entry!.settingNodes[0]!.options.enumOptions).toEqual(Permission)
    expect(entry!.settingNodes[0]!.options.default).toBe('ANYONE')
  })

  it('同一 handler 可叠加多个 SettingNode', () => {
    registerHandlerWithSettings('feature3', [
      { key: 'enabled', options: { type: 'boolean', default: true } },
      {
        key: 'permission',
        options: {
          type: 'enum',
          default: 'ANYONE',
          enumOptions: Permission,
        },
      },
    ])

    expect(handlerRegistry.get('feature3')!.settingNodes).toHaveLength(2)
  })
})

describe('buildSchemaMap 集成', () => {
  it('从 handlerRegistry 中收集配置节点', () => {
    registerHandlerWithSettings('myfeature', [
      { key: 'enabled', options: { type: 'boolean', default: false } },
    ])

    const map = buildSchemaMap()
    expect(map.has('myfeature.enabled')).toBe(true)
    expect(map.get('myfeature.enabled')!.owner).toBe('myfeature')
  })
})
