import { Handler, handlerRegistry } from '@aemeath-projects/exostrider/dispatch'
import type { Redis } from 'ioredis'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import { SettingNode } from '@/core/settings/decorators.js'
import type { SettingNodeOptions } from '@/core/settings/decorators.js'
import { buildSchemaMap, SettingsService } from '@/core/settings/index.js'
import { Path } from '@/core/settings/path.js'

/* Mock 工厂 */

/**
 * pipeline() 必须每次返回同一个 pipe 实例（而非每次 new 一个），
 * 否则测试里 `redis.pipeline().set` 拿到的是一个全新的 vi.fn，
 * 与 SettingsService 内部实际调用的 pipeline().set 不是同一个 mock，断言永远不会命中。
 */
function createMockRedis(values: Record<string, string | null> = {}) {
  const store = { ...values }
  let ops: (() => void)[] = []
  const pipe = {
    // 签名与 ioredis pipeline.set(key, val, 'EX', ttl) 一致，供测试断言 TTL 是否被正确传递
    set: vi.fn((key: string, val: string, ..._ttlArgs: unknown[]) => {
      ops.push(() => {
        store[key] = val
      })
      return pipe
    }),
    del: vi.fn((key: string) => {
      ops.push(() => {
        delete store[key]
      })
      return pipe
    }),
    exec: vi.fn(() => {
      ops.forEach((op) => {
        op()
      })
      ops = []
      return Promise.resolve([])
    }),
  }

  return {
    mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map((k) => store[k] ?? null))),
    get: vi.fn((key: string) => Promise.resolve(store[key] ?? null)),
    set: vi.fn((key: string, val: string) => {
      store[key] = val
      return Promise.resolve('OK')
    }),
    del: vi.fn((...keys: string[]) => {
      for (const k of keys) delete store[k]
      return Promise.resolve(keys.length)
    }),
    pipeline: vi.fn(() => pipe),
    _store: store,
  } as unknown as Redis & { _store: Record<string, string> }
}

/**
 * rows 按 scope 分组：{ [scope]: [{key,value}] }
 * 必须区分两种查询形态：_resolveCandidates() 用精确 key 匹配（无 LIKE），
 * getAll() 用 'prefix%' 前缀匹配（含 LIKE）——两者的 values[0] 语义不同，
 * 若不区分会导致 getAll 相关用例恒为空（LIKE 模式串被当成精确 key 比较）。
 */
function createMockDb(rows: Record<string, { key: string; value: string }[]> = {}) {
  return {
    $queryRaw: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
      const scopes = values.find((v) => Array.isArray(v)) as string[] | undefined
      const flat = Object.entries(rows).flatMap(([scope, entries]) =>
        entries.map((e) => ({ scope, key: e.key, value: e.value })),
      )
      const inScope = (r: { scope: string }) => scopes?.includes(r.scope) ?? true

      // 路由判据基于 values[0] 的实际内容形状，而非 SQL 文本关键词：
      // getAll() 的 values[0] 恒为 'prefix%' 前缀模式串；_resolveCandidates() 的 values[0] 恒为精确 key。
      const firstValue = typeof values[0] === 'string' ? values[0] : ''

      if (firstValue.endsWith('%')) {
        // getAll()：values[0] 是 'prefix%' 形式的前缀模式串
        const prefix = firstValue.slice(0, -1)
        return Promise.resolve(flat.filter((r) => inScope(r) && r.key.startsWith(prefix)))
      }

      // _resolveCandidates()：values[0] 是精确 key
      const key = typeof values[0] === 'string' ? values[0] : undefined
      return Promise.resolve(flat.filter((r) => inScope(r) && (key === undefined || r.key === key)))
    }),
    $executeRaw: vi.fn().mockResolvedValue(1),
  } as unknown as AemeathPrismaClient
}

class TestFeature {
  handle(): void {}
}

beforeEach(() => {
  handlerRegistry.clear()
})

function registerTestHandler(): void {
  const metadata: Record<symbol, unknown> = {}
  const ctxBase = {
    kind: 'class' as const,
    metadata,
    addInitializer: () => {},
    name: 'TestFeature',
  }
  const nodes: { key: string; options: SettingNodeOptions }[] = [
    { key: 'enabled', options: { type: 'boolean', default: true } },
    {
      key: 'permission',
      options: { type: 'enum', default: 'ANYONE', enumOptions: { ANYONE: 0, ADMIN: 100 } },
    },
    { key: 'count', options: { type: 'number', default: 5 } },
    { key: 'label', options: { type: 'string', default: 'hello' } },
  ]
  for (const node of nodes) {
    SettingNode(node.key, node.options)(TestFeature, ctxBase)
  }
  Handler({ name: 'feature', displayName: 'Test Feature' })(TestFeature, ctxBase)
}

function createService(
  dbRows: Parameters<typeof createMockDb>[0] = {},
  redisValues: Record<string, string | null> = {},
) {
  registerTestHandler()
  const schemaMap = buildSchemaMap()
  const redis = createMockRedis(redisValues)
  const db = createMockDb(dbRows)
  return { service: new SettingsService(db, redis, schemaMap), redis, db }
}

describe('SettingsService.get', () => {
  it('Redis 命中最具体候选时直接返回反序列化值', async () => {
    const { service } = createService({}, { 'settings:feature.enabled:group:99': 'false' })
    const result = await service.get<boolean>('feature.enabled', Path.group('99'))
    expect(result).toBe(false)
  })

  it('最具体候选为 __NULL__ 但回退链上更根层级命中时返回该值', async () => {
    const { service } = createService(
      {},
      {
        'settings:feature.enabled:group:99': '__NULL__',
        'settings:feature.enabled:': 'false',
      },
    )
    const result = await service.get<boolean>('feature.enabled', Path.group('99'))
    expect(result).toBe(false)
  })

  it('全部候选未命中时回退到 Schema default', async () => {
    const { service } = createService()
    const result = await service.get<boolean>('feature.enabled', Path.group('99'))
    expect(result).toBe(true)
  })

  it('DB 未命中时写回 Redis 哨兵并带 SENTINEL_TTL', async () => {
    const { service, redis } = createService()
    await service.get<boolean>('feature.enabled', Path.group('99'))
    expect(redis.pipeline().set).toHaveBeenCalledWith(
      'settings:feature.enabled:group:99',
      '__NULL__',
      'EX',
      600,
    )
  })

  it('DB 命中时写回 Redis 正向缓存并带 POSITIVE_TTL', async () => {
    const { service, redis } = createService({
      'group:99': [{ key: 'feature.enabled', value: 'false' }],
    })
    await service.get<boolean>('feature.enabled', Path.group('99'))
    expect(redis.pipeline().set).toHaveBeenCalledWith(
      'settings:feature.enabled:group:99',
      'false',
      'EX',
      300,
    )
  })

  it('DB 命中根层级覆盖行（系统级配置）', async () => {
    const { service } = createService({ '': [{ key: 'feature.enabled', value: 'false' }] })
    const result = await service.get<boolean>('feature.enabled', Path.group('99'))
    expect(result).toBe(false)
  })

  it('DB 同时存在群级与系统级覆盖行时取最具体的群级', async () => {
    const { service } = createService({
      'group:99': [{ key: 'feature.enabled', value: 'false' }],
      '': [{ key: 'feature.enabled', value: 'true' }],
    })
    const result = await service.get<boolean>('feature.enabled', Path.group('99'))
    expect(result).toBe(false)
  })

  it('number 类型正确反序列化', async () => {
    const { service } = createService({}, { 'settings:feature.count:group:99': '42' })
    const result = await service.get<number>('feature.count', Path.group('99'))
    expect(result).toBe(42)
  })

  it('groupMember path 候选链条正确覆盖三层', async () => {
    const { service } = createService({ 'group:99': [{ key: 'feature.enabled', value: 'false' }] })
    const result = await service.get<boolean>('feature.enabled', Path.groupMember('99', '1'))
    expect(result).toBe(false)
  })

  it('不传 path 时读取系统级配置', async () => {
    const { service } = createService({ '': [{ key: 'feature.count', value: '7' }] })
    const result = await service.get<number>('feature.count')
    expect(result).toBe(7)
  })
})

describe('SettingsService.set', () => {
  it('写入有效 boolean 值并失效对应 scope 缓存', async () => {
    const { service, db, redis } = createService()
    await service.set('feature.enabled', false, Path.group('100'), 'feature')

    expect(db.$executeRaw).toHaveBeenCalled()
    expect(redis.del).toHaveBeenCalledWith('settings:feature.enabled:group:100')
  })

  it('ownerName 与 key 前缀不匹配时抛出 ForbiddenError', async () => {
    const { service } = createService()
    await expect(
      service.set('feature.enabled', false, Path.group('100'), 'other_owner'),
    ).rejects.toThrow('无权修改配置项')
  })

  it('bypassOwnership=true 时跳过归属校验', async () => {
    const { service, db } = createService()
    await service.set('feature.enabled', false, Path.group('100'), 'other_owner', {
      bypassOwnership: true,
    })
    expect(db.$executeRaw).toHaveBeenCalled()
  })

  it('写入无效 enum 标签应抛出异常', async () => {
    const { service } = createService()
    await expect(
      service.set('feature.permission', 'INVALID_LABEL', Path.group('100'), 'feature'),
    ).rejects.toThrow('无效枚举值')
  })

  it('写入未知 key 应抛出异常', async () => {
    const { service } = createService()
    await expect(
      service.set('unknown.key', true, Path.group('100'), 'unknown', { bypassOwnership: true }),
    ).rejects.toThrow('未知配置项')
  })

  it('写入超长字符串应抛出异常', async () => {
    const { service } = createService()
    await expect(
      service.set('feature.label', 'x'.repeat(513), Path.group('100'), 'feature'),
    ).rejects.toThrow()
  })

  it('value 为 null 时删除该 scope 覆盖行', async () => {
    const { service, db } = createService()
    await service.set('feature.enabled', null, Path.group('100'), 'feature')
    expect(db.$executeRaw).toHaveBeenCalled()
  })

  it('系统级（空 path）写入使用空串 scope', async () => {
    const { service, redis } = createService()
    await service.set('feature.enabled', true, Path.system(), 'feature')
    expect(redis.del).toHaveBeenCalledWith('settings:feature.enabled:')
  })
})

describe('SettingsService.scopedTo', () => {
  it('scopedTo 绑定的 ownerName 通过校验', async () => {
    const { service, db } = createService()
    const scoped = service.scopedTo('feature')
    await scoped.set('feature.enabled', false, Path.group('1'))
    expect(db.$executeRaw).toHaveBeenCalled()
  })

  it('scopedTo 绑定的 ownerName 与 key 前缀不符时抛出异常', async () => {
    const { service } = createService()
    const scoped = service.scopedTo('other')
    await expect(scoped.set('feature.enabled', false, Path.group('1'))).rejects.toThrow(
      '无权修改配置项',
    )
  })
})

describe('SettingsService.getAll', () => {
  it('无覆盖行时全部返回 Schema default', async () => {
    const { service } = createService()
    const all = await service.getAll('feature.', Path.group('1'))
    expect(all['feature.enabled']).toEqual({
      value: true,
      overridden: false,
      overriddenAtDepth: null,
    })
  })

  it('系统级覆盖行 overriddenAtDepth 为 0', async () => {
    const { service } = createService({ '': [{ key: 'feature.enabled', value: 'false' }] })
    const all = await service.getAll('feature.', Path.group('1'))
    expect(all['feature.enabled']).toEqual({
      value: false,
      overridden: true,
      overriddenAtDepth: 0,
    })
  })

  it('叶子层覆盖行 overriddenAtDepth 等于 path 长度', async () => {
    const { service } = createService({ 'group:1': [{ key: 'feature.enabled', value: 'false' }] })
    const all = await service.getAll('feature.', Path.group('1'))
    expect(all['feature.enabled']?.overriddenAtDepth).toBe(1)
  })

  it('多层同时存在覆盖行时取最具体一层', async () => {
    const { service } = createService({
      'group:1': [{ key: 'feature.enabled', value: 'false' }],
      '': [{ key: 'feature.enabled', value: 'true' }],
    })
    const all = await service.getAll('feature.', Path.group('1'))
    expect(all['feature.enabled']).toEqual({
      value: false,
      overridden: true,
      overriddenAtDepth: 1,
    })
  })
})

describe('SettingsService.resolveEnum', () => {
  it('正确将枚举标签映射为数值', () => {
    const { service } = createService()
    expect(service.resolveEnum('feature.permission', 'ANYONE')).toBe(0)
    expect(service.resolveEnum('feature.permission', 'ADMIN')).toBe(100)
  })

  it('无效标签应抛出异常', () => {
    const { service } = createService()
    expect(() => service.resolveEnum('feature.permission', 'UNKNOWN')).toThrow('无效枚举标签')
  })

  it('非 enum 类型 key 应抛出异常', () => {
    const { service } = createService()
    expect(() => service.resolveEnum('feature.enabled', 'true')).toThrow('不是 enum 类型')
  })
})

describe('SettingsService.getSchemas', () => {
  it('无前缀返回全部 schema', () => {
    const { service } = createService()
    expect(service.getSchemas().length).toBeGreaterThan(0)
  })

  it('前缀过滤返回子集', () => {
    const { service } = createService()
    const schemas = service.getSchemas('feature.')
    expect(schemas.every((s) => s.key.startsWith('feature.'))).toBe(true)
  })
})
