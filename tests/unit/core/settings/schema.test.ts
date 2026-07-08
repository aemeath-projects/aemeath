import { handlerRegistry, Handler } from '@aemeath-projects/exostrider/dispatch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import { SettingNode } from '@/core/settings/decorators.js'
import type { SettingNodeOptions } from '@/core/settings/decorators.js'
import { buildSchemaMap, cleanOrphanKeys } from '@/core/settings/index.js'

beforeEach(() => {
  handlerRegistry.clear()
})

class TestHandler {
  handle(): void {}
}

/** 注册带 settingNode 的 handler 到 handlerRegistry */
function registerHandlerWithNode(
  handlerName: string,
  key: string,
  options: SettingNodeOptions,
): void {
  const metadata: Record<symbol, unknown> = {}
  const ctxBase = {
    kind: 'class' as const,
    metadata,
    addInitializer: () => {},
    name: 'TestHandler',
  }
  SettingNode(key, options)(TestHandler, ctxBase)
  Handler({ name: handlerName, displayName: `Test ${handlerName}` })(TestHandler, ctxBase)
}

describe('buildSchemaMap', () => {
  it('内置 bot.enabled 始终包含在 schemaMap 中', () => {
    const map = buildSchemaMap()
    expect(map.has('bot.enabled')).toBe(true)
    expect(map.get('bot.enabled')).toEqual({
      key: 'bot.enabled',
      type: 'boolean',
      default: true,
      description: 'Bot 总开关（群级）',
      enumOptions: undefined,
      owner: '__system__',
      ownerDisplayName: '系统',
      applicableScopeHint: ['group'],
      category: 'permission',
    })
  })

  it('内置 iris.archive_cycle_days 始终包含在 schemaMap 中', () => {
    const map = buildSchemaMap()
    expect(map.get('iris.archive_cycle_days')).toEqual({
      key: 'iris.archive_cycle_days',
      type: 'number',
      default: 0,
      description: '归档周期（天），0 表示禁用；master 账号所在群未设置时默认 180',
      enumOptions: undefined,
      owner: '__system__',
      ownerDisplayName: '系统',
      applicableScopeHint: ['group'],
      category: 'config',
    })
  })

  it('内置 accounts.priority_mode 始终包含在 schemaMap 中', () => {
    const map = buildSchemaMap()
    expect(map.get('accounts.priority_mode')).toEqual({
      key: 'accounts.priority_mode',
      type: 'enum',
      default: 'prefer_master',
      description: '多账号消息路由优先级模式',
      enumOptions: { prefer_master: 0, prefer_normal: 1 },
      owner: '__system__',
      ownerDisplayName: '系统',
      category: 'config',
    })
  })

  it('从 handlerRegistry 收集用户定义的配置项，字段值与声明完全一致', () => {
    registerHandlerWithNode('myfeature', 'enabled', {
      type: 'boolean',
      default: false,
      description: '功能开关',
      applicableScopeHint: ['group', 'user'],
    })

    const map = buildSchemaMap()
    expect(map.has('myfeature.enabled')).toBe(true)
    expect(map.get('myfeature.enabled')).toEqual({
      key: 'myfeature.enabled',
      type: 'boolean',
      default: false,
      description: '功能开关',
      enumOptions: undefined,
      owner: 'myfeature',
      ownerDisplayName: 'Test myfeature',
      applicableScopeHint: ['group', 'user'],
      category: 'permission',
    })
  })

  it('没有额外 handler 注册时 map 只含内置的三个 key', () => {
    const map = buildSchemaMap()
    expect(map.has('orphan.enabled')).toBe(false)
    expect(Array.from(map.keys()).sort()).toEqual([
      'accounts.priority_mode',
      'bot.enabled',
      'iris.archive_cycle_days',
    ])
  })

  it('category 默认按 key 后缀推断为 permission', () => {
    registerHandlerWithNode('feat', 'permission', {
      type: 'enum',
      default: 'ANYONE',
      enumOptions: { ANYONE: 0 },
    })
    const map = buildSchemaMap()
    expect(map.get('feat.permission')!.category).toBe('permission')
    expect(map.get('feat.permission')!.enumOptions).toEqual({ ANYONE: 0 })
  })

  it('category 默认按 key 后缀推断为 config（非 enabled/permission 结尾）', () => {
    registerHandlerWithNode('feat', 'max_count', { type: 'number', default: 10 })
    const map = buildSchemaMap()
    expect(map.get('feat.max_count')!.category).toBe('config')
  })

  it('category 显式指定时优先于后缀推断', () => {
    registerHandlerWithNode('feat', 'enabled', {
      type: 'boolean',
      default: true,
      category: 'config',
    })
    const map = buildSchemaMap()
    expect(map.get('feat.enabled')!.category).toBe('config')
  })

  it('不同 owner 声明同一个最终 key 时抛出碰撞错误', () => {
    registerHandlerWithNode('bot', 'enabled', { type: 'boolean', default: true })
    expect(() => buildSchemaMap()).toThrow(/配置项 key 冲突/)
    expect(() => buildSchemaMap()).toThrow(/bot\.enabled/)
  })

  it('同一 owner 重复声明同一 key（继承覆盖场景）不抛出碰撞错误', () => {
    const metadata: Record<symbol, unknown> = {}
    const ctxBase = {
      kind: 'class' as const,
      metadata,
      addInitializer: () => {},
      name: 'TestHandler',
    }
    SettingNode('enabled', { type: 'boolean', default: false })(TestHandler, ctxBase)
    SettingNode('enabled', { type: 'boolean', default: true, description: '覆盖后' })(
      TestHandler,
      ctxBase,
    )
    Handler({ name: 'inherited', displayName: 'Inherited' })(TestHandler, ctxBase)

    expect(() => buildSchemaMap()).not.toThrow()
    const map = buildSchemaMap()
    expect(map.get('inherited.enabled')!.default).toBe(true)
    expect(map.get('inherited.enabled')!.description).toBe('覆盖后')
  })
})

describe('cleanOrphanKeys', () => {
  function createMockDb(existingKeys: string[] = [], affectedRows = 1) {
    return {
      $queryRaw: vi.fn().mockResolvedValue(existingKeys.map((key) => ({ key }))),
      $executeRaw: vi.fn().mockResolvedValue(affectedRows),
    } as unknown as AemeathPrismaClient
  }

  it('DB 中不存在废弃 key 时不执行 DELETE，且查询表名为 setting_values', async () => {
    const map = buildSchemaMap()
    const db = createMockDb(['bot.enabled'])
    await cleanOrphanKeys(db, map)

    expect(db.$executeRaw).not.toHaveBeenCalled()
    const queryStrings = vi.mocked(db.$queryRaw).mock
      .calls[0]?.[0] as unknown as TemplateStringsArray
    expect(queryStrings.join('')).toContain('setting_values')
  })

  it('Schema 中不存在的 DB key 应被 DELETE，且携带精确的 orphan key 列表与目标表', async () => {
    const map = buildSchemaMap()
    const db = createMockDb(['obsolete.key', 'bot.enabled'])
    await cleanOrphanKeys(db, map)

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    const call = vi.mocked(db.$executeRaw).mock.calls[0]!
    const [deleteStrings, orphanArg] = call as unknown as [TemplateStringsArray, string[]]
    expect(deleteStrings.join('')).toContain('setting_values')
    expect(orphanArg).toEqual(['obsolete.key'])
  })

  it('DB 为空时不执行 DELETE', async () => {
    const map = buildSchemaMap()
    const db = createMockDb([])
    await cleanOrphanKeys(db, map)
    expect(db.$executeRaw).not.toHaveBeenCalled()
  })

  it('logger 回调被调用一次，日志中的行数来自 $executeRaw 的真实返回值而非 orphans.length', async () => {
    const map = buildSchemaMap()
    // 故意让 orphans.length（2）与 $executeRaw 返回的真实受影响行数（5）不同：
    // 因为同一 key 在 setting_values 中可能对应多个 scope 行，DELETE 影响的行数
    // 与被清理的 key 数量并非一一对应，日志必须反映真实受影响行数。
    const db = createMockDb(['obsolete.key', 'another.orphan'], 5)
    const logger = { info: vi.fn() }
    await expect(cleanOrphanKeys(db, map, logger)).resolves.toBeUndefined()

    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('5 行'))
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('2 行'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('obsolete.key'))
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('another.orphan'))
  })

  it('未传 logger 时不抛出异常', async () => {
    const map = buildSchemaMap()
    const db = createMockDb(['obsolete.key'])
    await expect(cleanOrphanKeys(db, map)).resolves.toBeUndefined()
  })
})
