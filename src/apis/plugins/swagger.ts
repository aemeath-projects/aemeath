/**
 * Swagger / OpenAPI 文档插件 —— 注册 @fastify/swagger 和 @fastify/swagger-ui。
 */

import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'

/**
 * 注册 OpenAPI 文档路由。
 *
 * 挂载路径：/docs
 */
export async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Aemeath API',
        version: '2.0.0',
        description: 'Aemeath QQ Bot 管理平台 API',
      },
      servers: [{ url: '/' }],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  })
}
