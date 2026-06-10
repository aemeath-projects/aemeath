/**
 * SettingsService —— 配置读写核心服务。
 */

import type { Redis } from 'ioredis'

import type { SettingNodeSchema } from './schema.js'

import type { MainPrismaClient } from '@/core/db/client.js'

// ── 常量 ──

const NULL_SENTINEL = '__NULL__'
const MATERIALIZED_SET = 'settings:materialized_groups'

// ── 内部类型 ──

interface SettingsDbRow {
  key: string
  value: string
  value_type: string
}

export interface SettingsScope {
  group?: bigint
  user?: bigint
}

// ── Service ──

export class SettingsService {
  private readonly db: MainPrismaClient
  private readonly redis: Redis
  private readonly schemaMap: ReadonlyMap<string, SettingNodeSchema>

  constructor(
    db: MainPrismaClient,
    redis: Redis,
    schemaMap: ReadonlyMap<string, SettingNodeSchema>,
  ) {
    this.db = db
    this.redis = redis
    this.schemaMap = schemaMap
  }

  /**
   * 读取单项配置。
   * 群聊链路: group Redis/DB → default Redis/DB → Schema default
   * 私聊链路: user Redis/DB → default Redis/DB → Schema default
   */
  async get<T = unknown>(key: string, scope?: SettingsScope): Promise<T> {
    const schema = this.schemaMap.get(key)

    // 确定目标 scope
    if (scope?.group) {
      const result = await this._resolve(key, 'group', scope.group)
      if (result !== undefined) return this._deserialize(result, schema) as T
    } else if (scope?.user) {
      const result = await this._resolve(key, 'user', scope.user)
      if (result !== undefined) return this._deserialize(result, schema) as T
    }

    // 回退到 default
    const defaultResult = await this._resolve(key, 'default', 0n)
    if (defaultResult !== undefined) return this._deserialize(defaultResult, schema) as T

    // 最终回退到 Schema default
    if (schema) return schema.default as T
    return undefined as T
  }

  /**
   * 读取前缀下所有配置，返回扁平 Record。
   * 先加载 default 全量，再用目标 scope 覆盖。
   */
  async getAll(prefix: string, scope?: { group?: bigint }): Promise<Record<string, unknown>> {
    if (scope?.group) {
      // 首次访问自动物化
      if (!(await this.isGroupMaterialized(scope.group))) {
        await this.materializeGroup(scope.group)
      }
    }

    const result: Record<string, unknown> = {}

    // Schema defaults 作为基底
    for (const [key, schema] of this.schemaMap) {
      if (key.startsWith(prefix)) {
        result[key] = schema.default
      }
    }

    // DB default 覆盖
    const defaultRows: SettingsDbRow[] = await this.db.$queryRaw`
      SELECT key, value, value_type FROM settings
      WHERE type = 'default' AND scope = 0 AND key LIKE ${prefix + '%'}
    `
    for (const row of defaultRows) {
      result[row.key] = this._deserialize(row.value, this.schemaMap.get(row.key))
    }

    // 群级覆盖
    if (scope?.group) {
      const groupRows: SettingsDbRow[] = await this.db.$queryRaw`
        SELECT key, value, value_type FROM settings
        WHERE type = 'group' AND scope = ${scope.group} AND key LIKE ${prefix + '%'}
      `
      for (const row of groupRows) {
        result[row.key] = this._deserialize(row.value, this.schemaMap.get(row.key))
      }
    }

    return result
  }

  /**
   * 写入单项配置，校验 + DB 写入 + 缓存失效。
   */
  async set(key: string, value: unknown, scope: SettingsScope): Promise<void> {
    const schema = this.schemaMap.get(key)
    if (!schema) throw new Error(`[settings] 未知配置项: ${key}`)

    const serialized = this._validate(key, value, schema)
    const { type, scopeId } = this._resolveScope(scope)

    await this.db.$executeRaw`
      INSERT INTO settings (key, type, scope, value, value_type)
      VALUES (${key}, ${type}::settings_entry_type, ${scopeId}, ${serialized}, ${schema.type}::settings_value_type)
      ON CONFLICT (key, type, scope) DO UPDATE SET value = ${serialized}
    `

    await this._invalidateCache(type, scopeId, key)
  }

  /**
   * 批量写入，自动校验 + 失效缓存。
   */
  async batchSet(entries: { key: string; value: unknown }[], scope: SettingsScope): Promise<void> {
    const { type, scopeId } = this._resolveScope(scope)

    for (const entry of entries) {
      const schema = this.schemaMap.get(entry.key)
      if (!schema) throw new Error(`[settings] 未知配置项: ${entry.key}`)

      const serialized = this._validate(entry.key, entry.value, schema)
      await this.db.$executeRaw`
        INSERT INTO settings (key, type, scope, value, value_type)
        VALUES (${entry.key}, ${type}::settings_entry_type, ${scopeId}, ${serialized}, ${schema.type}::settings_value_type)
        ON CONFLICT (key, type, scope) DO UPDATE SET value = ${serialized}
      `
    }

    // 批量失效缓存
    const pipeline = this.redis.pipeline()
    for (const entry of entries) {
      pipeline.del(this._cacheKey(type, scopeId, entry.key))
    }
    await pipeline.exec()
  }

  /** 获取 Schema 列表（供后台渲染表单）。 */
  getSchemas(prefix?: string): SettingNodeSchema[] {
    const schemas = [...this.schemaMap.values()]
    if (!prefix) return schemas
    return schemas.filter((s) => s.key.startsWith(prefix))
  }

  /** 物化群配置（Copy-on-Access）。 */
  async materializeGroup(groupId: bigint): Promise<void> {
    const lockKey = `settings:materialize_lock:${groupId.toString()}`
    const acquired = await this.redis.set(lockKey, '1', 'EX', 30, 'NX')
    if (!acquired) return

    try {
      if (await this.redis.sismember(MATERIALIZED_SET, groupId.toString())) return

      await this.db.$executeRaw`
        INSERT INTO settings (key, type, scope, value, value_type)
        SELECT key, 'group'::settings_entry_type, ${groupId}, value, value_type
        FROM settings
        WHERE type = 'default' AND scope = 0
        ON CONFLICT DO NOTHING
      `

      await this.redis.sadd(MATERIALIZED_SET, groupId.toString())

      // 清除该群所有配置项缓存，下次访问重新从 DB 加载
      const keys = [...this.schemaMap.keys()].map((k) => this._cacheKey('group', groupId, k))
      if (keys.length > 0) await this.redis.del(...keys)
    } finally {
      await this.redis.del(lockKey)
    }
  }

  /** 检查群是否已物化。 */
  async isGroupMaterialized(groupId: bigint): Promise<boolean> {
    const result = await this.redis.sismember(MATERIALIZED_SET, groupId.toString())
    return result === 1
  }

  /** 将 enum 标签解析为数值。 */
  resolveEnum(key: string, label: string): number {
    const schema = this.schemaMap.get(key)
    if (!schema?.enumOptions) throw new Error(`[settings] ${key} 不是 enum 类型`)
    const value = schema.enumOptions[label]
    if (value === undefined) throw new Error(`[settings] ${key} 无效枚举标签: ${label}`)
    return value
  }

  // ── 私有方法 ──

  private _cacheKey(type: string, scope: bigint, key: string): string {
    return `settings:${type}:${scope.toString()}:${key}`
  }

  /** 尝试从 Redis/DB 解析单个 key，返回原始 value 字符串或 undefined（表示不存在）。 */
  private async _resolve(key: string, type: string, scope: bigint): Promise<string | undefined> {
    const cacheKey = this._cacheKey(type, scope, key)

    // Redis 查询
    const cached = await this.redis.get(cacheKey)
    if (cached !== null) {
      return cached === NULL_SENTINEL ? undefined : cached
    }

    // DB 查询
    const rows: SettingsDbRow[] = await this.db.$queryRaw`
      SELECT key, value, value_type FROM settings
      WHERE key = ${key} AND type = ${type}::settings_entry_type AND scope = ${scope}
      LIMIT 1
    `

    const row = rows[0]
    if (row) {
      await this.redis.set(cacheKey, row.value)
      return row.value
    }

    // 穿透防护
    await this.redis.set(cacheKey, NULL_SENTINEL)
    return undefined
  }

  private async _invalidateCache(type: string, scope: bigint, key: string): Promise<void> {
    await this.redis.del(this._cacheKey(type, scope, key))
  }

  /** 根据 Schema 类型反序列化字符串值。 */
  private _deserialize(raw: string, schema?: SettingNodeSchema): unknown {
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

  /** 校验值合法性，返回序列化字符串。 */
  private _validate(key: string, value: unknown, schema: SettingNodeSchema): string {
    switch (schema.type) {
      case 'boolean':
        if (typeof value !== 'boolean') throw new Error(`[settings] ${key} 必须为 boolean`)
        return String(value)
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value))
          throw new Error(`[settings] ${key} 必须为有限数值`)
        return String(value)
      case 'string':
        if (typeof value !== 'string' || value.length === 0 || value.length > 512)
          throw new Error(`[settings] ${key} 必须为 1-512 字符的字符串`)
        return value
      case 'enum': {
        if (typeof value !== 'string') throw new Error(`[settings] ${key} 必须为枚举标签字符串`)
        if (!schema.enumOptions?.[value] && schema.enumOptions?.[value] !== 0)
          throw new Error(`[settings] ${key} 无效枚举值: ${value}`)
        return value
      }
    }
  }

  /** 将 scope 参数转为 type + scopeId。 */
  private _resolveScope(scope: SettingsScope): { type: string; scopeId: bigint } {
    if (scope.group) return { type: 'group', scopeId: scope.group }
    if (scope.user) return { type: 'user', scopeId: scope.user }
    return { type: 'default', scopeId: 0n }
  }
}
