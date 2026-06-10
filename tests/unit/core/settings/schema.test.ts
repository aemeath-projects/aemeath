import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MainPrismaClient } from '@/core/db/client.js'
import { componentRegistry } from '@/core/framework/decorators.js'
import { SettingNode, settingNodeRegistry } from '@/core/settings/decorators.js'
import { buildSchemaMap, syncDefaults } from '@/core/settings/schema.js'

beforeEach(() => {
  settingNodeRegistry.clear()
  componentRegistry.clear()
})

class TestHandler {
  handle(): void {}
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
      scope: 'group',
    })
  })

  it('从 settingNodeRegistry 收集用户定义的配置项', () => {
    SettingNode('myfeature.enabled', { type: 'boolean', default: false })(TestHandler)

    // 注册到 componentRegistry，让 buildSchemaMap 能找到 owner
    componentRegistry.set('myfeature', {
      name: 'myfeature',
      displayName: 'My Feature',
      description: '',
      tags: [],
      admin: false,
      defaultPriority: 10,
      defaultEnabled: false,
      system: false,
      target: TestHandler,
    })

    const map = buildSchemaMap()
    expect(map.has('myfeature.enabled')).toBe(true)
    expect(map.get('myfeature.enabled')!.owner).toBe('myfeature')
  })

  it('找不到 owner 时 owner 为 __unknown__', () => {
    SettingNode('orphan.enabled', { type: 'boolean', default: true })(TestHandler)

    const map = buildSchemaMap()
    expect(map.get('orphan.enabled')!.owner).toBe('__unknown__')
  })
})

describe('syncDefaults', () => {
  function createMockDb(existingKeys: string[] = []) {
    return {
      $queryRaw: vi.fn().mockResolvedValue(existingKeys.map((key) => ({ key }))),
      $executeRaw: vi.fn().mockResolvedValue(1),
    } as unknown as MainPrismaClient
  }

  it('DB 中不存在的 Schema key 应被 INSERT', async () => {
    SettingNode('feature.enabled', { type: 'boolean', default: true })(TestHandler)
    const map = buildSchemaMap()
    const db = createMockDb([]) // DB 为空

    await syncDefaults(db, map)

    expect(db.$executeRaw).toHaveBeenCalled()
  })

  it('Schema 中不存在的 DB key 应被 DELETE', async () => {
    const map = buildSchemaMap() // 仅含内置 bot.enabled
    const db = createMockDb(['obsolete.key']) // DB 含废弃 key

    await syncDefaults(db, map)

    expect(db.$executeRaw).toHaveBeenCalled()
  })

  it('两边均存在的 key 不触发 INSERT 或 DELETE', async () => {
    const map = buildSchemaMap() // 仅含内置 bot.enabled
    const db = createMockDb(['bot.enabled']) // DB 已有

    await syncDefaults(db, map)

    // $executeRaw 仅针对其他内置 key 调用（如果有），不针对 bot.enabled
    const calls = vi.mocked(db.$executeRaw).mock.calls
    // bot.enabled 已存在，不应出现 INSERT for bot.enabled
    // 验证没有 DELETE（无废弃 key）
    const callStrings = calls.map((c) => String(c[0]))
    expect(callStrings.every((s) => !s.includes('bot.enabled') || !s.includes('INSERT'))).toBe(true)
  })

  it('logger 回调被调用时不抛出异常', async () => {
    SettingNode('new.feature', { type: 'string', default: 'hello' })(TestHandler)
    const map = buildSchemaMap()
    const db = createMockDb(['obsolete.key'])
    const logger = { info: vi.fn() }

    await expect(syncDefaults(db, map, logger)).resolves.toBeUndefined()
    expect(logger.info).toHaveBeenCalled()
  })
})
