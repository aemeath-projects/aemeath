/**
 * 用户反馈 REST API 路由 —— /api/feedbacks。
 */

import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import {
  FeedbackIdParamSchema,
  FeedbackListQuerySchema,
  FeedbackUpdateBodySchema,
  PaginatedFeedbacksDataSchema,
  FeedbackDetailDataSchema,
} from '@/apis/schemas/index.js'
import { ok, fail, OkResponse, FailResponse } from '@/core/schemas/index.js'
import type { Feedback, FeedbackService } from '@/services/feedback.js'

async function getFeedbackSvc(app: FastifyInstance): Promise<FeedbackService> {
  return app.services.get('feedback_service') as FeedbackService
}

interface UpdateStatusBody {
  status: string
  adminReply?: string | null
}

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b)
}

function feedbackToDict(f: Feedback): Record<string, unknown> {
  return {
    id: f.id,
    userId: String(f.userId),

    groupId: f.groupId != null ? String(f.groupId) : null,
    content: f.content,
    status: f.status,
    feedbackType: f.feedbackType ?? null,
    source: f.source,
    adminReply: f.adminReply ?? null,
    createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
    updatedAt: f.updatedAt instanceof Date ? f.updatedAt.toISOString() : f.updatedAt,
    processedAt: f.processedAt instanceof Date ? f.processedAt.toISOString() : f.processedAt,
  }
}

/**
 * 反馈管理路由插件。
 */
const feedbackRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/feedbacks — 分页查询反馈列表。 */
  app.get(
    '/api/feedbacks',
    {
      schema: {
        querystring: FeedbackListQuerySchema,
        response: {
          200: OkResponse(PaginatedFeedbacksDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        Querystring: {
          page?: string
          pageSize?: string
          status?: string
          feedbackType?: string
          userId?: string
          source?: string
          search?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = await getFeedbackSvc(app)

      const page = req.query.page ? parseInt(req.query.page, 10) : 1
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 20

      const [items, total] = await svc.listFeedbacks({
        page,
        pageSize,
        status: req.query.status,
        feedbackType: req.query.feedbackType,
        userId: req.query.userId ? BigInt(req.query.userId) : undefined,
        source: req.query.source,
        search: req.query.search,
      })

      const pages = ceilDiv(total, pageSize)
      await reply.send(
        ok({
          items: items.map((f) => feedbackToDict(f)),
          total,
          page,
          pageSize,
          pages,
        }),
      )
    },
  )

  /** GET /api/feedbacks/:feedbackId — 获取单个反馈详情。 */
  app.get(
    '/api/feedbacks/:feedbackId',
    {
      schema: {
        params: FeedbackIdParamSchema,
        response: {
          200: OkResponse(FeedbackDetailDataSchema),
          400: FailResponse(),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (req: FastifyRequest<{ Params: { feedbackId: string } }>, reply: FastifyReply) => {
      const svc = await getFeedbackSvc(app)
      const feedback = await svc.getFeedback(req.params.feedbackId)

      if (feedback === null) {
        await reply.status(404).send(fail('Feedback not found'))
        return
      }

      await reply.send(ok(feedbackToDict(feedback)))
    },
  )

  /** POST /api/feedbacks/:feedbackId/status — 更新反馈状态。 */
  app.post(
    '/api/feedbacks/:feedbackId/status',
    {
      schema: {
        params: FeedbackIdParamSchema,
        body: FeedbackUpdateBodySchema,
        response: {
          200: OkResponse(Type.Null()),
          400: FailResponse(),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { feedbackId: string }
        Body: UpdateStatusBody
      }>,
      reply: FastifyReply,
    ) => {
      const svc = await getFeedbackSvc(app)
      const { status, adminReply } = req.body

      const feedback = await svc.updateStatus(
        req.params.feedbackId,
        status,
        adminReply ?? undefined,
      )
      if (feedback === null) {
        await reply.status(404).send(fail('Feedback not found'))
        return
      }

      await reply.send(ok(null, 'Status updated successfully'))
    },
  )
}

export default feedbackRoutes
export { feedbackRoutes }
