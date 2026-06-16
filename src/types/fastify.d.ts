/**
 * Fastify 类型扩展 —— 为 FastifyInstance 添加服务注册表访问。
 */

import type { ServiceRegistry } from '@/core/lifecycle/service-registry.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** 运行时应用状态（由生命周期编排器挂载，路由注册后保证非空）。 */
    state: {
      serviceRegistry: ServiceRegistry
      [key: string]: unknown
    }
  }
}
