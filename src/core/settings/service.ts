/**
 * SettingsService —— 配置读写核心服务。
 */

import type { Redis } from 'ioredis'
import { v4 as uuidv4 } from 'uuid'

import { Prisma } from '#prisma/aemeath'

import { buildAncestorScopes, toScope } from './path.js'
import type { Path } from './path.js'
import type { SettingNodeSchema } from './schema.js'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import { ForbiddenError, ValidationError } from '@/core/errors.js'

/* 常量 */

const NULL_SENTINEL = '__NULL__'
/** 正向缓存 TTL（秒）—— 与"写入时精确失效"互为对称保底。 */
const POSITIVE_TTL_SECONDS = 300
/** 未命中哨兵 TTL（秒），略长于正向缓存，降低同一 scope 链条反复穿透 DB 的概率。 */
const SENTINEL_TTL_SECONDS = 600

/* 内部类型 */

interface CandidateRow {
  scope: string
  value: string
}

interface PrefixRow {
  key: string
  scope: string
  value: string
}

export interface SettingsGetAllEntry {
  value: unknown
  overridden: boolean
  /** 相对 path 根的深度：0 表示系统级根，path.length 表示叶子层；未覆盖时为 null。 */
  overriddenAtDepth: number | null
}

export interface SetOptions {
  /** 仅限管理端 API 层内部使用，绕过模块写权限归属校验。 */
  bypassOwnership?: boolean
}

/* Service */

export class SettingsService {
  private readonly db: AemeathPrismaClient
  private readonly redis: Redis
  private readonly schemaMap: ReadonlyMap<string, SettingNodeSchema>

  constructor(
    db: AemeathPrismaClient,
    redis: Redis,
    schemaMap: ReadonlyMap<string, SettingNodeSchema>,
  ) {
    this.db = db
    this.redis = redis
    this.schemaMap = schemaMap
  }

  /**
   * 读取单项配置，沿 path 从叶子到根逐级回退，全部未命中时回退 Schema default。
   */
  async get<T = unknown>(key: string, path: Path = []): Promise<T> {
    const schema = this.schemaMap.get(key)
    const candidates = buildAncestorScopes(path)
    const raw = await this._resolveCandidates(key, candidates)
    if (raw !== undefined) return this._deserialize(raw, schema) as T
    if (schema) return schema.default as T
    return undefined as T
  }

  /**
   * 读取前缀下所有配置，返回带覆盖深度标记的 Record。
   * Schema defaults 为基底，path 链条上任意层级的覆盖行会取"最具体"的一层。
   */
  async getAll(prefix: string, path: Path = []): Promise<Record<string, SettingsGetAllEntry>> {
    const result: Record<string, SettingsGetAllEntry> = {}

    for (const [key, schema] of this.schemaMap) {
      if (key.startsWith(prefix)) {
        result[key] = { value: schema.default, overridden: false, overriddenAtDepth: null }
      }
    }

    const candidates = buildAncestorScopes(path) // 索引 0 最具体（叶子），最后一项恒为 ""
    const rows: PrefixRow[] = await this.db.$queryRaw`
      SELECT key, scope, value FROM settings
      WHERE key LIKE ${prefix + '%'} AND scope = ANY(${candidates})
    `

    const depthByScope = new Map(candidates.map((s, idx) => [s, path.length - idx]))
    const bestCandidateIdx = new Map<string, number>()
    for (const row of rows) {
      const idx = candidates.indexOf(row.scope)
      const existing = bestCandidateIdx.get(row.key)
      if (existing === undefined || idx < existing) bestCandidateIdx.set(row.key, idx)
    }
    for (const row of rows) {
      if (bestCandidateIdx.get(row.key) !== candidates.indexOf(row.scope)) continue
      result[row.key] = {
        value: this._deserialize(row.value, this.schemaMap.get(row.key)),
        overridden: true,
        overriddenAtDepth: depthByScope.get(row.scope) ?? null,
      }
    }

    return result
  }

  /**
   * 写入单项配置，校验模块写权限归属 + 类型校验 + DB 写入 + 精确失效该 scope 缓存。
   * value 为 null 时表示重置（删除该 scope 的覆盖行，回退到上一级）。
   */
  async set(
    key: string,
    value: unknown,
    path: Path,
    ownerName: string,
    opts: SetOptions = {},
  ): Promise<void> {
    this._checkOwnership(key, ownerName, opts)
    const scope = toScope(path)

    if (value === null) {
      await this.db.$executeRaw`DELETE FROM settings WHERE key = ${key} AND scope = ${scope}`
      await this._invalidateCache(key, scope)
      return
    }

    const schema = this.schemaMap.get(key)
    if (!schema) throw new ValidationError(`[settings] 未知配置项: ${key}`)
    const serialized = this._validate(key, value, schema)

    await this.db.$executeRaw`
      INSERT INTO settings (id, key, scope, value, value_type)
      VALUES (${uuidv4()}, ${key}, ${scope}, ${serialized}, ${schema.type}::setting_type)
      ON CONFLICT (key, scope) DO UPDATE SET value = ${serialized}
    `

    await this._invalidateCache(key, scope)
  }

  /**
   * 批量写入同一 path 下的多项配置，预先校验全部条目再单条 SQL 批量 UPSERT。
   */
  async batchSet(
    entries: { key: string; value: unknown }[],
    path: Path,
    ownerName: string,
    opts: SetOptions = {},
  ): Promise<void> {
    if (entries.length === 0) return
    const scope = toScope(path)

    const validated = entries.map((entry) => {
      this._checkOwnership(entry.key, ownerName, opts)
      const schema = this.schemaMap.get(entry.key)
      if (!schema) throw new ValidationError(`[settings] 未知配置项: ${entry.key}`)
      return {
        key: entry.key,
        serialized: this._validate(entry.key, entry.value, schema),
        valueType: schema.type,
      }
    })

    const valueRows = validated.map(
      (e) =>
        Prisma.sql`(${uuidv4()}, ${e.key}, ${scope}, ${e.serialized}, ${e.valueType}::setting_type)`,
    )
    await this.db.$executeRaw(
      Prisma.sql`
        INSERT INTO settings (id, key, scope, value, value_type)
        VALUES ${Prisma.join(valueRows)}
        ON CONFLICT (key, scope) DO UPDATE SET value = EXCLUDED.value
      `,
    )

    const pipeline = this.redis.pipeline()
    for (const entry of entries) {
      pipeline.del(this._cacheKey(entry.key, scope))
    }
    await pipeline.exec()
  }

  /** 返回绑定了 ownerName 的轻量包装，业务代码通过它调用无需每次传 ownerName。 */
  scopedTo(ownerName: string): ScopedSettingsService {
    return new ScopedSettingsService(this, ownerName)
  }

  /** 获取 Schema 列表（供后台渲染表单）。 */
  getSchemas(prefix?: string): SettingNodeSchema[] {
    const schemas = [...this.schemaMap.values()]
    if (!prefix) return schemas
    return schemas.filter((s) => s.key.startsWith(prefix))
  }

  /** 将 enum 标签解析为数值。 */
  resolveEnum(key: string, label: string): number {
    const schema = this.schemaMap.get(key)
    if (!schema?.enumOptions) throw new ValidationError(`[settings] ${key} 不是 enum 类型`)
    const value = schema.enumOptions[label]
    if (value === undefined) throw new ValidationError(`[settings] ${key} 无效枚举标签: ${label}`)
    return value
  }

  /* 私有方法 */

  private _checkOwnership(key: string, ownerName: string, opts: SetOptions): void {
    if (opts.bypassOwnership) return
    if (!key.startsWith(`${ownerName}.`)) {
      throw new ForbiddenError(`[settings] ${ownerName} 无权修改配置项: ${key}`)
    }
  }

  private _cacheKey(key: string, scope: string): string {
    return `settings:${key}:${scope}`
  }

  /**
   * 沿候选 scope 链条批量查询：Redis MGET 一次取全部候选缓存，
   * 未命中的候选批量查 DB（scope = ANY），写回 Redis（含未命中哨兵），
   * 返回候选顺序中第一个命中的原始字符串值。
   */
  private async _resolveCandidates(key: string, candidates: string[]): Promise<string | undefined> {
    const cacheKeys = candidates.map((scope) => this._cacheKey(key, scope))
    const cached = await this.redis.mget(...cacheKeys)

    const missingScopes: string[] = []
    for (const [i, scope] of candidates.entries()) {
      if (cached[i] === null) missingScopes.push(scope)
    }

    let dbRows: CandidateRow[] = []
    if (missingScopes.length > 0) {
      dbRows = await this.db.$queryRaw`
        SELECT scope, value FROM settings
        WHERE key = ${key} AND scope = ANY(${missingScopes})
      `
    }
    const dbByScope = new Map(dbRows.map((r) => [r.scope, r.value]))

    const pipeline = this.redis.pipeline()
    let result: string | undefined

    for (const [i, scope] of candidates.entries()) {
      let value: string | undefined
      const cachedValue = cached[i]
      if (cachedValue !== null && cachedValue !== undefined) {
        value = cachedValue === NULL_SENTINEL ? undefined : cachedValue
      } else {
        value = dbByScope.get(scope)
        const cacheValue = value ?? NULL_SENTINEL
        const ttl = value !== undefined ? POSITIVE_TTL_SECONDS : SENTINEL_TTL_SECONDS
        pipeline.set(this._cacheKey(key, scope), cacheValue, 'EX', ttl)
      }
      if (value !== undefined && result === undefined) {
        result = value
      }
    }

    if (missingScopes.length > 0) await pipeline.exec()
    return result
  }

  /**
   * 失效指定 scope 的缓存。
   * 已知权衡：与并发 get() 之间存在经典的缓存旁路"失效竞态"——若 get() 的 DB 读发生在
   * set() 写入之前、但其 Redis 写回发生在本次 del 之后，会写回一份陈旧值，
   * 最长 POSITIVE_TTL_SECONDS（300 秒）后自愈。当前未引入版本号/二次延迟删除等加固手段，
   * 该窗口期内敏感的权限类配置读取可能短暂读到旧值，属于已接受的设计权衡。
   */
  private async _invalidateCache(key: string, scope: string): Promise<void> {
    await this.redis.del(this._cacheKey(key, scope))
  }

  /** 根据 Schema 类型反序列化字符串值（原样保留，未改动）。 */
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

  /** 校验值合法性，返回序列化字符串（原样保留，未改动）。 */
  private _validate(key: string, value: unknown, schema: SettingNodeSchema): string {
    switch (schema.type) {
      case 'boolean':
        if (typeof value !== 'boolean')
          throw new ValidationError(`[settings] ${key} 必须为 boolean`)
        return String(value)
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value))
          throw new ValidationError(`[settings] ${key} 必须为有限数值`)
        return String(value)
      case 'string':
        if (typeof value !== 'string' || value.length === 0 || value.length > 512)
          throw new ValidationError(`[settings] ${key} 必须为 1-512 字符的字符串`)
        return value
      case 'enum': {
        if (typeof value !== 'string')
          throw new ValidationError(`[settings] ${key} 必须为枚举标签字符串`)
        if (!schema.enumOptions?.[value] && schema.enumOptions?.[value] !== 0)
          throw new ValidationError(`[settings] ${key} 无效枚举值: ${value}`)
        return value
      }
    }
  }
}

/** 绑定了固定 ownerName 的轻量包装，业务 handler 通过 ctx.settings 拿到的即为此类型实例。 */
export class ScopedSettingsService {
  constructor(
    private readonly inner: SettingsService,
    private readonly ownerName: string,
  ) {}

  get<T = unknown>(key: string, path: Path = []): Promise<T> {
    return this.inner.get<T>(key, path)
  }

  getAll(prefix: string, path: Path = []): Promise<Record<string, SettingsGetAllEntry>> {
    return this.inner.getAll(prefix, path)
  }

  set(key: string, value: unknown, path: Path): Promise<void> {
    return this.inner.set(key, value, path, this.ownerName)
  }

  batchSet(entries: { key: string; value: unknown }[], path: Path): Promise<void> {
    return this.inner.batchSet(entries, path, this.ownerName)
  }
}
