// tests/unit/core/settings/query.test.ts
import { describe, expect, it, vi } from 'vitest'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import { getSettingValue } from '@/core/settings/index.js'
import type { SettingsQueryContext } from '@/core/settings/index.js'
import { Path } from '@/core/settings/path.js'

function createMockDb(rows: { scope: string; value: string }[] = []) {
  return {
    $queryRaw: vi.fn().mockImplementation(() => Promise.resolve(rows)),
  } as unknown as AemeathPrismaClient
}

describe('getSettingValue', () => {
  const schemaMap = new Map([
    ['bot.enabled', { key: 'bot.enabled', type: 'boolean' as const, default: true }],
    [
      'daily_checkin.enabled',
      { key: 'daily_checkin.enabled', type: 'boolean' as const, default: false },
    ],
    ['checkin.reward', { key: 'checkin.reward', type: 'number' as const, default: 10 }],
  ])

  it('DB 有覆盖行时返回 DB 值', async () => {
    const db = createMockDb([{ scope: 'group:123', value: 'false' }])
    const ctx: SettingsQueryContext = { db, schemaMap, path: Path.group('123') }
    const result = await getSettingValue<boolean>('bot.enabled', ctx)
    expect(result).toBe(false)
  })

  it('DB 无覆盖行时回退 schema default', async () => {
    const db = createMockDb([])
    const ctx: SettingsQueryContext = { db, schemaMap, path: Path.group('456') }
    const result = await getSettingValue<boolean>('daily_checkin.enabled', ctx)
    expect(result).toBe(false)
  })

  it('schema 无此 key 时返回 undefined', async () => {
    const db = createMockDb([])
    const ctx: SettingsQueryContext = { db, schemaMap }
    const result = await getSettingValue('nonexistent.key', ctx)
    expect(result).toBeUndefined()
  })

  it('不传 path 时查询系统级 scope', async () => {
    const db = createMockDb([{ scope: '', value: 'true' }])
    const ctx: SettingsQueryContext = { db, schemaMap }
    const result = await getSettingValue<boolean>('bot.enabled', ctx)
    expect(result).toBe(true)
  })

  it('候选链条上取最具体的一行（group 优先于系统级）', async () => {
    const db = createMockDb([
      { scope: 'group:789', value: 'true' },
      { scope: '', value: 'false' },
    ])
    const ctx: SettingsQueryContext = { db, schemaMap, path: Path.group('789') }
    const result = await getSettingValue<boolean>('bot.enabled', ctx)
    expect(result).toBe(true)
  })

  it('groupMember 三层路径：群级有覆盖行、成员级没有，回退取群级值', async () => {
    const db = createMockDb([{ scope: 'group:111', value: 'true' }])
    const ctx: SettingsQueryContext = {
      db,
      schemaMap,
      path: Path.groupMember('111', '222'),
    }
    const result = await getSettingValue<boolean>('bot.enabled', ctx)
    expect(result).toBe(true)
  })

  it('number 类型正确反序列化', async () => {
    const db = createMockDb([{ scope: 'group:333', value: '25' }])
    const ctx: SettingsQueryContext = { db, schemaMap, path: Path.group('333') }
    const result = await getSettingValue<number>('checkin.reward', ctx)
    expect(result).toBe(25)
  })
})
