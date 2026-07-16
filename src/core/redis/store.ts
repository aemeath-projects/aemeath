/**
 * Redis 数据存储封装 —— 提供 JSON 序列化、TTL 管理、模式删除等常用操作。
 */

import type { Redis } from 'ioredis'

export class RedisStore {
  private readonly redis: Redis
  private readonly defaultTtl: number

  constructor(redis: Redis, defaultTtl = 300) {
    this.redis = redis
    this.defaultTtl = defaultTtl
  }

  /** 从缓存获取值，自动 JSON 反序列化；键不存在时返回 null。 */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as T
    }
  }

  /** 写入缓存，自动 JSON 序列化，使用 SETEX 设置过期时间。 */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const seconds = ttl ?? this.defaultTtl
    const serialized = JSON.stringify(value)
    if (seconds > 0) {
      await this.redis.setex(key, seconds, serialized)
    } else {
      await this.redis.set(key, serialized)
    }
  }

  /** 删除指定键。 */
  async del(key: string): Promise<void> {
    await this.redis.del(key)
  }

  /** 检查键是否存在。 */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key)
    return result === 1
  }

  /** 自增键的值，返回自增后的结果。 */
  async incr(key: string): Promise<number> {
    return this.redis.incr(key)
  }

  /** 设置键的过期时间（秒）。 */
  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds)
  }

  /**
   * 从缓存获取值；若未命中，则调用 factory 生成值，写入缓存后返回。
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached
    const result = await factory()
    await this.set(key, result, ttl)
    return result
  }

  /**
   * 原子性地仅在键不存在时写入值（SET NX EX）。
   *
   * @param key    Redis 键
   * @param value  写入的字符串值
   * @param ttlMs  过期时长（毫秒），必须 > 0
   * @returns 写入成功返回 true，键已存在返回 false
   */
  async setNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, value, 'PX', ttlMs, 'NX')
    return result === 'OK'
  }

  /**
   * 按 glob 模式批量删除匹配的键（使用 SCAN 迭代，避免 KEYS 阻塞）。
   *
   * @returns 删除的键数量
   */
  async deleteByPattern(pattern: string): Promise<number> {
    let cursor = '0'
    let deleted = 0
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = nextCursor
      if (keys.length > 0) {
        deleted += await this.redis.del(...keys)
      }
    } while (cursor !== '0')
    return deleted
  }

  /**
   * 批量获取多个键的值，自动 JSON 反序列化；单个键不存在时对应位置为 null。
   * 空 keys 数组直接返回空数组，不发起 Redis 调用。
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return []
    const raws = await this.redis.mget(...keys)
    return raws.map((raw) => {
      if (raw === null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return raw as T
      }
    })
  }

  /**
   * 批量写入多个键值对（一次 Redis pipeline 往返），自动 JSON 序列化；
   * 有 ttl 用 SETEX，无 ttl 用 SET（不过期）。空 entries 数组不发起 Redis 调用。
   */
  async pipelineSet(entries: { key: string; value: unknown; ttl?: number }[]): Promise<void> {
    if (entries.length === 0) return
    const pipeline = this.redis.pipeline()
    for (const entry of entries) {
      const serialized = JSON.stringify(entry.value)
      if (entry.ttl !== undefined && entry.ttl > 0) {
        pipeline.setex(entry.key, entry.ttl, serialized)
      } else {
        pipeline.set(entry.key, serialized)
      }
    }
    await pipeline.exec()
  }
}
