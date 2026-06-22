/**
 * 注册表统一入口。
 */
export { handlerRegistry } from '@aemeath-projects/exostrider/dispatch'
export { ServiceRegistry } from '@aemeath-projects/exostrider/lifecycle'
export { metricRegistry } from './monitoring/registry.js'
export { cacheKeyRegistry } from './redis/registry.js'
