/**
 * 配置管理 REST API —— /api/settings。
 */

import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import {
  SetValueRequestSchema,
  BatchSetRequestSchema,
  SettingsKeyParamSchema,
  SettingsQuerySchema,
  SettingsValuesQuerySchema,
  SettingsSchemaListDataSchema,
  SettingsRecordDataSchema,
  type PathValue,
  type SetValueRequest,
  type BatchSetRequest,
} from '@/apis/schemas/index.js'
import { ValidationError } from '@/core/errors.js'
import { ok, fail, OkResponse, FailResponse } from '@/core/schemas/index.js'
import type { SettingsService } from '@/core/settings/index.js'

/** API 层代表管理员写入任意模块的配置，不归属任何具体业务模块。 */
const ADMIN_OWNER = '__admin__'

function getSettings(app: FastifyInstance): SettingsService {
  return app.services.get('settings') as SettingsService
}

/** 解析 URL 编码的 Path JSON 数组，缺省或空串时视为系统级（空数组）。 */
function parsePathQuery(raw: string | undefined): PathValue {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ValidationError('[settings] path 参数不是合法的 JSON 数组')
  }
  if (!Array.isArray(parsed)) throw new ValidationError('[settings] path 必须是数组')
  return parsed as PathValue
}

/**
 * 配置管理路由插件。
 */
const permissionRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/settings/schemas — 获取所有配置项 Schema（供前端渲染表单）。 */
  app.get(
    '/api/settings/schemas',
    {
      schema: {
        querystring: SettingsQuerySchema,
        response: {
          200: OkResponse(SettingsSchemaListDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (req: FastifyRequest<{ Querystring: { prefix?: string } }>, reply: FastifyReply) => {
      const svc = getSettings(app)
      const schemas = svc.getSchemas(req.query.prefix)
      await reply.send(ok(schemas))
    },
  )

  /** GET /api/settings/values — 读取指定 path 下的配置值（含 Schema 默认值回退）。 */
  app.get(
    '/api/settings/values',
    {
      schema: {
        querystring: SettingsValuesQuerySchema,
        response: {
          200: OkResponse(SettingsRecordDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{ Querystring: { prefix?: string; path?: string } }>,
      reply: FastifyReply,
    ) => {
      const svc = getSettings(app)
      try {
        const path = parsePathQuery(req.query.path)
        const data = await svc.getAll(req.query.prefix ?? '', path)
        await reply.send(ok(data))
      } catch (err) {
        await reply.status(400).send(fail(String(err)))
      }
    },
  )

  /** POST /api/settings/values/:key — 设置单项配置。 */
  app.post(
    '/api/settings/values/:key',
    {
      schema: {
        params: SettingsKeyParamSchema,
        body: SetValueRequestSchema,
        response: {
          200: OkResponse(Type.Null()),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{ Params: { key: string }; Body: SetValueRequest }>,
      reply: FastifyReply,
    ) => {
      const svc = getSettings(app)
      try {
        await svc.set(req.params.key, req.body.value, req.body.path, ADMIN_OWNER, {
          bypassOwnership: true,
        })
        await reply.send(ok(null, 'ok'))
      } catch (err) {
        await reply.status(400).send(fail(String(err)))
      }
    },
  )

  /** POST /api/settings/values/batch — 批量设置指定 path 下的配置。 */
  app.post(
    '/api/settings/values/batch',
    {
      schema: {
        body: BatchSetRequestSchema,
        response: {
          200: OkResponse(Type.Null()),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (req: FastifyRequest<{ Body: BatchSetRequest }>, reply: FastifyReply) => {
      const svc = getSettings(app)
      try {
        await svc.batchSet(req.body.entries, req.body.path, ADMIN_OWNER, { bypassOwnership: true })
        await reply.send(ok(null, 'ok'))
      } catch (err) {
        await reply.status(400).send(fail(String(err)))
      }
    },
  )
}

export default permissionRoutes
export { permissionRoutes }
