/** Settings 纯函数查询 —— Worker 与主进程共用，无 Redis 缓存层。 */

import { buildAncestorScopes } from './path.js'
import type { Path } from './path.js'

import type { MainPrismaClient } from '@/core/db/index.js'

export interface MinimalSettingSchema {
  key: string
  type: 'boolean' | 'number' | 'string' | 'enum'
  default: unknown
}

export interface SettingsQueryContext {
  db: MainPrismaClient
  schemaMap: ReadonlyMap<string, MinimalSettingSchema>
  path?: Path
}

interface CandidateRow {
  scope: string
  value: string
}

/**
 * 沿 path 回退链批量查询单项配置，未命中时回退 schema default。
 * 不使用 Redis 缓存，适合低频 Worker 调用。
 */
export async function getSettingValue<T = unknown>(
  key: string,
  ctx: SettingsQueryContext,
): Promise<T> {
  const schema = ctx.schemaMap.get(key)
  const candidates = buildAncestorScopes(ctx.path ?? [])

  const rows: CandidateRow[] = await ctx.db.$queryRaw`
    SELECT scope, value FROM setting_values
    WHERE key = ${key} AND scope = ANY(${candidates})
  `
  const byScope = new Map(rows.map((r) => [r.scope, r.value]))

  for (const scope of candidates) {
    const raw = byScope.get(scope)
    if (raw !== undefined) return _deserialize(raw, schema) as T
  }

  if (schema !== undefined) return schema.default as T
  return undefined as T
}

/** 根据 Schema 类型反序列化字符串值。 */
function _deserialize(raw: string, schema?: MinimalSettingSchema): unknown {
  if (!schema) return raw
  switch (schema.type) {
    case 'boolean':
      return raw === 'true'
    case 'number':
      return Number(raw)
    case 'string':
    case 'enum':
      return raw
  }
}
