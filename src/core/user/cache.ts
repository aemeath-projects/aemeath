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

cacheKeyRegistry.register({
  namespace: 'user',
  name: 'admins',
  build: () => 'aemeath:user:admins',
})

/** 用户关系缓存 glob 模式。 */
export const USER_RELATION_GLOB = 'aemeath:user:relation:*'
