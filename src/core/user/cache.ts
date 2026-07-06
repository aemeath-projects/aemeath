/** user 领域 cache key 自注册。 */
import { cacheKeyRegistry } from '@/core/registries.js'

cacheKeyRegistry.register({
  namespace: 'user',
  name: 'sync_status',
  build: () => 'aemeath:user:sync_status',
})

cacheKeyRegistry.register({
  namespace: 'user',
  name: 'sync_lock',
  build: () => 'aemeath:lock:user_sync',
})

cacheKeyRegistry.register({
  namespace: 'user',
  name: 'relation',
  build: (qq) => `aemeath:user:relation:${qq}`,
})

/** 当前御者 QQ 缓存（0 或 1 个，空字符串表示"查过但没有御者"哨兵）。 */
cacheKeyRegistry.register({
  namespace: 'user',
  name: 'admin',
  build: () => 'aemeath:user:admin',
})

/** 御者设置/移除临界区分布式锁，setAdmin 与 removeAdmin 共用。 */
cacheKeyRegistry.register({
  namespace: 'user',
  name: 'admin_lock',
  build: () => 'aemeath:lock:admin',
})

/** 用户关系缓存 glob 模式。 */
export const USER_RELATION_GLOB = 'aemeath:user:relation:*'
