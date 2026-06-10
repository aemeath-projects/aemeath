/**
 * 配置管理 REST API —— /api/settings。
 *
 * 替代原 /api/permissions 路由，通过 SettingsService 读写配置项。
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

import type { SettingsService } from '@/core/settings/service.js'
import { ok, fail } from '@/core/utils/response.js'

function getSettings(app: FastifyInstance): SettingsService {
  const state = (app as unknown as { state: Record<string, unknown> }).state
  return state.settings as SettingsService
}

// ── 请求体接口 ──

interface SetValueBody {
  value: unknown
}

interface BatchSetBody {
  entries: { key: string; value: unknown }[]
}

/**
 * 配置管理路由插件。
 */
export async function permissionRoutes(app: FastifyInstance): Promise<void> {
  // ── Schema 查询 ──

  /** GET /api/settings/schemas — 获取所有配置项 Schema（供前端渲染表单）。 */
  app.get(
    '/api/settings/schemas',
    async (req: FastifyRequest<{ Querystring: { prefix?: string } }>, reply: FastifyReply) => {
      const svc = getSettings(app)
      const schemas = svc.getSchemas(req.query.prefix)
      await reply.send(ok(schemas))
    },
  )

  // ── 默认值读写 ──

  /** GET /api/settings/default — 读取前缀下所有 default 配置。 */
  app.get(
    '/api/settings/default',
    async (req: FastifyRequest<{ Querystring: { prefix?: string } }>, reply: FastifyReply) => {
      const svc = getSettings(app)
      const prefix = req.query.prefix ?? ''
      const data = await svc.getAll(prefix)
      await reply.send(ok(data))
    },
  )

  /** POST /api/settings/default/:key — 设置 default 配置项值。 */
  app.post(
    '/api/settings/default/:key',
    async (
      req: FastifyRequest<{ Params: { key: string }; Body: SetValueBody }>,
      reply: FastifyReply,
    ) => {
      const svc = getSettings(app)
      try {
        await svc.set(req.params.key, req.body.value, {})
        await reply.send(ok(null, 'ok'))
      } catch (err) {
        await reply.status(400).send(fail(String(err)))
      }
    },
  )

  // ── 群级配置 ──

  /** GET /api/settings/groups/:groupId — 读取群级配置（含 default 回退）。 */
  app.get(
    '/api/settings/groups/:groupId',
    async (
      req: FastifyRequest<{ Params: { groupId: string }; Querystring: { prefix?: string } }>,
      reply: FastifyReply,
    ) => {
      const svc = getSettings(app)
      const groupId = BigInt(req.params.groupId)
      const prefix = req.query.prefix ?? ''
      const data = await svc.getAll(prefix, { group: groupId })
      await reply.send(ok(data))
    },
  )

  /** POST /api/settings/groups/:groupId/:key — 设置群级单项配置。 */
  app.post(
    '/api/settings/groups/:groupId/:key',
    async (
      req: FastifyRequest<{ Params: { groupId: string; key: string }; Body: SetValueBody }>,
      reply: FastifyReply,
    ) => {
      const svc = getSettings(app)
      try {
        await svc.set(req.params.key, req.body.value, { group: BigInt(req.params.groupId) })
        await reply.send(ok(null, 'ok'))
      } catch (err) {
        await reply.status(400).send(fail(String(err)))
      }
    },
  )

  /** POST /api/settings/groups/:groupId/batch — 批量设置群级配置。 */
  app.post(
    '/api/settings/groups/:groupId/batch',
    async (
      req: FastifyRequest<{ Params: { groupId: string }; Body: BatchSetBody }>,
      reply: FastifyReply,
    ) => {
      const svc = getSettings(app)
      try {
        await svc.batchSet(req.body.entries, { group: BigInt(req.params.groupId) })
        await reply.send(ok(null, 'ok'))
      } catch (err) {
        await reply.status(400).send(fail(String(err)))
      }
    },
  )

  // ── 用户级配置 ──

  /** POST /api/settings/users/:userId/:key — 设置用户级单项配置。 */
  app.post(
    '/api/settings/users/:userId/:key',
    async (
      req: FastifyRequest<{ Params: { userId: string; key: string }; Body: SetValueBody }>,
      reply: FastifyReply,
    ) => {
      const svc = getSettings(app)
      try {
        await svc.set(req.params.key, req.body.value, { user: BigInt(req.params.userId) })
        await reply.send(ok(null, 'ok'))
      } catch (err) {
        await reply.status(400).send(fail(String(err)))
      }
    },
  )
}
