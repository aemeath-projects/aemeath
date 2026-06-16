/**
 * CORS 插件 —— 注册 @fastify/cors，允许前端跨域访问。
 */

import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'

/**
 * 注册 CORS 插件。
 *
 * 允许的来源从环境变量 CORS_ORIGINS 读取（逗号分隔），
 * 默认为 http://localhost:5173（Vite 开发服务器）。
 */
export async function corsPlugin(app: FastifyInstance, corsOrigins: string): Promise<void> {
  const origins = corsOrigins.split(',').map((o) => o.trim())

  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
}
