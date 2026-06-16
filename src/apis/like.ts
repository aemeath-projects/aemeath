/**
 * 点赞管理 REST API —— /api/like。
 */

import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import {
  CreateLikeTaskRequestSchema,
  LikeTasksQuerySchema,
  LikeHistoryQuerySchema,
  LikeTaskParamsSchema,
  PaginatedLikeTasksResponseSchema,
  PaginatedLikeHistoryResponseSchema,
  type CreateLikeTaskRequest,
  type LikeTasksQuery,
  type LikeHistoryQuery,
} from '@/apis/schemas/index.js'
import { fail, ok, FailResponse, OkResponse } from '@/core/schemas/index.js'
import type { LikeService } from '@/services/like.js'

async function getLikeSvc(app: FastifyInstance): Promise<LikeService> {
  const { LikeService: Cls } = await import('@/services/like.js')

  return app.services.getTyped(Cls, 'like_service')
}

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b)
}

/**
 * 点赞管理路由插件。
 */
const likeRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/like/tasks — 分页查询已注册的定时点赞任务列表。 */
  app.get(
    '/api/like/tasks',
    {
      schema: {
        querystring: LikeTasksQuerySchema,
        response: { 200: OkResponse(PaginatedLikeTasksResponseSchema) },
      },
    },
    async (req: FastifyRequest<{ Querystring: LikeTasksQuery }>, reply: FastifyReply) => {
      const svc = await getLikeSvc(app)

      const page = req.query.page ?? 1
      const pageSize = req.query.pageSize ?? 20

      const [items, total] = await svc.listTasks({ page, pageSize })
      const taskItems = items.map((t: Record<string, unknown>) => ({
        id: t.id,
        qq: String(t.qq as bigint | number),
        registeredAt:
          t.registeredAt instanceof Date
            ? t.registeredAt.toISOString()
            : (t.registeredAt as string),
        registeredGroupId:
          t.registeredGroupId !== null && t.registeredGroupId !== undefined
            ? String(t.registeredGroupId as bigint | number)
            : null,
      }))

      await reply.send(
        ok({ items: taskItems, total, page, pageSize, pages: ceilDiv(total, pageSize) }),
      )
    },
  )

  /** POST /api/like/tasks — 新增定时点赞任务。 */
  app.post(
    '/api/like/tasks',
    {
      schema: {
        body: CreateLikeTaskRequestSchema,
        response: { 200: OkResponse(Type.Object({ qq: Type.Number() })), 409: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Body: CreateLikeTaskRequest }>, reply: FastifyReply) => {
      const svc = await getLikeSvc(app)

      const result = await svc.registerTask(BigInt(req.body.qq), null)
      if (result.alreadyExists) {
        await reply.status(409).send(fail('该用户已存在定时点赞任务'))
        return
      }
      await reply.send(ok({ qq: req.body.qq }))
    },
  )

  /** POST /api/like/tasks/:qq/cancel — 取消指定用户的定时点赞任务。 */
  app.post(
    '/api/like/tasks/:qq/cancel',
    {
      schema: {
        params: LikeTaskParamsSchema,
        response: { 200: OkResponse(Type.Object({ qq: Type.String() })), 404: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Params: { qq: string } }>, reply: FastifyReply) => {
      const svc = await getLikeSvc(app)

      const qq = BigInt(req.params.qq)
      const deleted = await svc.cancelTask(qq)
      if (!deleted) {
        await reply.status(404).send(fail('任务不存在'))
        return
      }
      await reply.send(ok({ qq: req.params.qq }))
    },
  )

  /** GET /api/like/history — 分页查询点赞执行历史。 */
  app.get(
    '/api/like/history',
    {
      schema: {
        querystring: LikeHistoryQuerySchema,
        response: { 200: OkResponse(PaginatedLikeHistoryResponseSchema) },
      },
    },
    async (req: FastifyRequest<{ Querystring: LikeHistoryQuery }>, reply: FastifyReply) => {
      const svc = await getLikeSvc(app)
      const qq = req.query.qq ? BigInt(req.query.qq) : undefined
      const source = req.query.source
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : undefined
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : undefined
      const page = req.query.page ?? 1
      const pageSize = req.query.pageSize ?? 20

      const [items, total] = await svc.listHistory({ qq, source, dateFrom, dateTo, page, pageSize })
      const historyItems = items.map((h: Record<string, unknown>) => ({
        id: h.id,
        qq: String(h.qq as bigint | number),
        times: h.times,
        triggeredAt:
          h.triggeredAt instanceof Date ? h.triggeredAt.toISOString() : (h.triggeredAt as string),
        source: h.source,
        success: h.success,
      }))

      await reply.send(
        ok({ items: historyItems, total, page, pageSize, pages: ceilDiv(total, pageSize) }),
      )
    },
  )
}

export default likeRoutes
export { likeRoutes }
