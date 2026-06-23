/**
 * RedisLockProvider —— 将 RedisStore 包装为 exostrider LockProvider 接口。
 */
import type { LockProvider } from '@aemeath-projects/exostrider/session'

import type { RedisStore } from '@/core/redis/index.js'

/** 基于 Redis 的分布式锁实现，供 SessionManager 使用。 */
export class RedisLockProvider implements LockProvider {
  constructor(private readonly _cache: RedisStore) {}

  async acquire(key: string, ttl: number): Promise<boolean> {
    return this._cache.setNx(key, '1', ttl)
  }

  async release(key: string): Promise<void> {
    await this._cache.del(key)
  }

  async cleanup(pattern: string): Promise<void> {
    await this._cache.deleteByPattern(pattern)
  }
}
