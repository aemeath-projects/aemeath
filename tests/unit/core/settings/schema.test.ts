import {
  handlerRegistry,
  Handler,
  SettingNode,
  type SettingNodeEntry,
} from '@aemeath-projects/exostrider/dispatch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MainPrismaClient } from '@/core/db.js'
import { buildSchemaMap, cleanOrphanKeys } from '@/core/settings/schema.js'

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
  options: SettingNodeEntry['options'],
): void {
  const metadata: Record<symbol, unknown> = {}
  const ctxBase = {
    kind: 'class' as const,
    metadata,
    addInitializer: () => {},
  }
  SettingNode(key, options)(TestHandler, { ...ctxBase, name: 'TestHandler' })
  Handler({ name: handlerName, displayName: `Test ${handlerName}` })(TestHandler, {
    ...ctxBase,
    name: 'TestHandler',
  })
}

describe('buildSchemaMap', () => {
  it('内置 bot.enabled 始终包含在 schemaMap 中', () => {
    const map = buildSchemaMap()
    expect(map.has('bot.enabled')).toBe(true)
    expect(map.get('bot.enabled')).toMatchObject({
      key: 'bot.enabled',
      type: 'boolean',
      default: true,
      owner: '__system__',
      ownerDisplayName: '系统',
      scope: 'group',
      category: 'permission',
    })
  })

  it('从 handlerRegistry 收集用户定义的配置项', () => {
    registerHandlerWithNode('myfeature', 'enabled', { type: 'boolean', default: false })

    const map = buildSchemaMap()
    expect(map.has('myfeature.enabled')).toBe(true)
    expect(map.get('myfeature.enabled')!.owner).toBe('myfeature')
    expect(map.get('myfeature.enabled')!.ownerDisplayName).toBe('Test myfeature')
  })

  it('找不到 owner 时 owner 为 __unknown__（没有 handler 注册时）', () => {
    // 注意：在新版 API 中，settingNode 只能通过 @SettingNode + @Handler 注册，
    // 所以 "找不到 owner" 的场景实际上不再存在。
    // 这里验证没有额外 handler 时 map 只含内置项
    const map = buildSchemaMap()
    expect(map.has('orphan.enabled')).toBe(false)
  })
})

describe('cleanOrphanKeys', () => {
  function createMockDb(existingKeys: string[] = []) {
    return {
      $queryRaw: vi.fn().mockResolvedValue(existingKeys.map((key) => ({ key }))),
      $executeRaw: vi.fn().mockResolvedValue(1),
    } as unknown as MainPrismaClient
  }

  it('DB 中不存在废弃 key 时不执行 DELETE', async () => {
    const map = buildSchemaMap() // 仅含内置 bot.enabled
    const db = createMockDb(['bot.enabled']) // DB 与 schema 一致

    await cleanOrphanKeys(db, map)

    expect(db.$executeRaw).not.toHaveBeenCalled()
  })

  it('Schema 中不存在的 DB key 应被 DELETE', async () => {
    const map = buildSchemaMap() // 仅含内置 bot.enabled
    const db = createMockDb(['obsolete.key']) // DB 含废弃 key

    await cleanOrphanKeys(db, map)

    expect(db.$executeRaw).toHaveBeenCalled()
  })

  it('DB 为空时不执行 DELETE', async () => {
    const map = buildSchemaMap()
    const db = createMockDb([]) // DB 为空

    await cleanOrphanKeys(db, map)

    expect(db.$executeRaw).not.toHaveBeenCalled()
  })

  it('logger 回调被调用时不抛出异常', async () => {
    const map = buildSchemaMap()
    const db = createMockDb(['obsolete.key'])
    const logger = { info: vi.fn() }

    await expect(cleanOrphanKeys(db, map, logger)).resolves.toBeUndefined()
    expect(logger.info).toHaveBeenCalled()
  })
})
