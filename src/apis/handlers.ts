/**
 * 处理器管理 API 端点 —— 列出已注册的组件和处理器。
 */

import { handlerRegistry } from '@aemeath-projects/exostrider/dispatch'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import { HandlerListDataSchema } from '@/apis/schemas/index.js'
import { ok, OkResponse, FailResponse } from '@/core/schemas/index.js'

/**
 * 处理器管理路由插件。
 */
const handlerRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/handlers — 列出所有已注册的控制器及其处理器。 */
  app.get(
    '/api/handlers',
    {
      schema: {
        response: {
          200: OkResponse(HandlerListDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const controllers = handlerRegistry.entries.map((entry) => {
        const methods: Record<string, unknown>[] = entry.methods.map((methodMeta) => ({
          name: String(methodMeta.methodName),
          mappingType: methodMeta.mappingType,
          permission: methodMeta.permission,
          scope: methodMeta.scope,
          ...methodMeta.trigger,
        }))

        return {
          name: entry.options.name,
          displayName: entry.options.displayName,
          description: entry.options.description,
          tags: entry.options.tags,
          system: entry.options.system,
          methods,
        }
      })

      await reply.send(ok({ controllers }))
    },
  )
}

export default handlerRoutes
export { handlerRoutes }
