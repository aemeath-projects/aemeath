/**
 * 今日老婆管理 REST API —— /api/jrlp。
 */

import { getLogger } from '@logger'
import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import {
  JrlpRecordsQuerySchema,
  SetWifeRequestSchema,
  UpdateRecordRequestSchema,
  DeleteRecordRequestSchema,
  WifeRecordResponseSchema,
  PaginatedRecordsResponseSchema,
  type JrlpRecordsQuery,
  type SetWifeRequest,
  type UpdateRecordRequest,
  type DeleteRecordRequest,
} from '@/apis/schemas/index.js'
import { fail, ok, FailResponse, OkResponse } from '@/core/schemas/index.js'
import type { JrlpService, WifeRecord } from '@/services/jrlp.js'

const log = getLogger('jrlp')

async function getJrlpSvc(app: FastifyInstance): Promise<JrlpService> {
  const { JrlpService: Cls } = await import('@/services/jrlp.js')

  return app.services.getTyped(Cls, 'jrlp_service')
}

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b)
}

function recordToDict(r: WifeRecord): Record<string, unknown> {
  return {
    id: r.id,
    groupId: String(r.groupId),
    userId: String(r.userId),
    wifeQq: String(r.wifeQq),
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
    drawnAt: r.drawnAt instanceof Date ? r.drawnAt.toISOString() : r.drawnAt,
  }
}

/**
 * 今日老婆管理路由插件。
 */
const jrlpRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/jrlp/records — 分页查询抽取/预设记录。 */
  app.get(
    '/api/jrlp/records',
    {
      schema: {
        querystring: JrlpRecordsQuerySchema,
        response: { 200: OkResponse(PaginatedRecordsResponseSchema) },
      },
    },
    async (req: FastifyRequest<{ Querystring: JrlpRecordsQuery }>, reply: FastifyReply) => {
      const svc = await getJrlpSvc(app)

      const groupId = req.query.groupId ? BigInt(req.query.groupId) : undefined
      const userId = req.query.userId ? BigInt(req.query.userId) : undefined
      const recordDate = req.query.date ? new Date(req.query.date) : undefined
      const page = req.query.page ?? 1
      const pageSize = req.query.pageSize ?? 20

      const [records, total] = await svc.listRecords({
        groupId,
        userId,
        recordDate,
        page,
        pageSize,
      })
      const pages = ceilDiv(total, pageSize)

      await reply.send(
        ok({
          items: records.map((r) => recordToDict(r)),
          total,
          page,
          pageSize,
          pages,
        }),
      )
    },
  )

  /** POST /api/jrlp/records/create — 手动设置老婆（创建预设）。 */
  app.post(
    '/api/jrlp/records/create',
    {
      schema: {
        body: SetWifeRequestSchema,
        response: { 200: OkResponse(WifeRecordResponseSchema), 409: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Body: SetWifeRequest }>, reply: FastifyReply) => {
      const svc = await getJrlpSvc(app)

      try {
        const record = await svc.createPreset({
          groupId: req.body.groupId,
          userId: req.body.userId,
          wifeQq: req.body.wifeQq,
          recordDate: new Date(req.body.date),
        })
        await reply.send(ok(recordToDict(record), '设置成功'))
      } catch (err) {
        log.warn({ err }, '创建老婆预设失败')
        await reply.status(409).send(fail('设置失败，请检查参数或记录是否已存在'))
      }
    },
  )

  /** POST /api/jrlp/records/update — 修改记录的老婆信息。 */
  app.post(
    '/api/jrlp/records/update',
    {
      schema: {
        body: UpdateRecordRequestSchema,
        response: { 200: OkResponse(WifeRecordResponseSchema), 404: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Body: UpdateRecordRequest }>, reply: FastifyReply) => {
      const svc = await getJrlpSvc(app)

      const record = await svc.updateRecord(req.body.id, { wifeQq: req.body.wifeQq })
      if (record === null) {
        await reply.status(404).send(fail('记录不存在'))
        return
      }
      await reply.send(ok(recordToDict(record), '修改成功'))
    },
  )

  /** POST /api/jrlp/records/delete — 删除记录。 */
  app.post(
    '/api/jrlp/records/delete',
    {
      schema: {
        body: DeleteRecordRequestSchema,
        response: { 200: OkResponse(Type.Null()), 404: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Body: DeleteRecordRequest }>, reply: FastifyReply) => {
      const svc = await getJrlpSvc(app)

      const success = await svc.deleteRecord(req.body.id)
      if (!success) {
        await reply.status(404).send(fail('记录不存在'))
        return
      }
      await reply.send(ok(null, '删除成功'))
    },
  )
}

export default jrlpRoutes
export { jrlpRoutes }
