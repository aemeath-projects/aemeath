/**
 * Iris 聊天记录 REST API 路由 —— /api/iris。
 */

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import {
  GroupIdParamSchema,
  UserIdParamSchema,
  MessageIdParamSchema,
  GroupMessageQuerySchema,
  PrivateMessageQuerySchema,
  MessageContextQuerySchema,
  ArchiveListQuerySchema,
  ArchiveQuerySchema,
  MessageListDataSchema,
  MessageContextDataSchema,
  PaginatedArchivesDataSchema,
  ArchiveQueryDataSchema,
  IrisSearchQuerySchema,
  IrisTriggerArchiveBodySchema,
  IrisSearchDataSchema,
  IrisStatsDataSchema,
  IrisTriggerDataSchema,
} from '@/apis/schemas/index.js'
import type { IrisArchiveService, IrisService } from '@/core/iris/index.js'
import { ok, fail, OkResponse, FailResponse } from '@/core/schemas/index.js'

const log: PinoLogger = getLogger('iris') as unknown as PinoLogger

/**
 * 将 Prisma ChatMessage（含 bigint 字段）转换为 JSON-safe 对象。
 *
 * BigInt.prototype.toJSON 全局 polyfill 可保证 JSON.stringify 不抛错，
 * 但 AJV response schema 校验要求 integer 字段为 number 类型，bigint 会不通过。
 * 此处显式转换保证校验结果与序列化输出一致。
 */
function serializeChatMessage(m: Record<string, unknown>): Record<string, unknown> {
  return {
    id: Number(m.id),
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    messageId: Number(m.messageId),
    messageType: Number(m.messageType),
    groupId: m.groupId != null ? Number(m.groupId) : null,
    userId: Number(m.userId),
    rawMessage: m.rawMessage,
    segments: m.segments,
    senderNickname: m.senderNickname,
    senderCard: m.senderCard ?? null,
    senderRole: m.senderRole ?? null,
    storedAt: m.storedAt instanceof Date ? m.storedAt.toISOString() : m.storedAt,
  }
}

/** 触发归档任务的队列接口。 */
interface ArchiveQueue {
  add(name: string, data: unknown): Promise<{ id?: string }>
}

/**
 * Iris 聊天记录管理路由插件。
 */
const irisRoutes: FastifyPluginAsync = async (app) => {
  /* 消息查询 */

  /** GET /api/iris/messages/group/:groupId — 获取群聊消息列表（游标分页）。 */
  app.get(
    '/api/iris/messages/group/:groupId',
    {
      schema: {
        params: GroupIdParamSchema,
        querystring: GroupMessageQuerySchema,
        response: {
          200: OkResponse(MessageListDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { groupId: string }
        Querystring: {
          before?: string
          limit?: string
          keyword?: string
          userId?: string
          startDate?: string
          endDate?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = app.services.get('iris') as IrisService

      const groupId = BigInt(req.params.groupId)
      const q = req.query

      const result = await svc.getGroupHistory(groupId, {
        before: q.before ? new Date(q.before) : undefined,
        limit: q.limit ? parseInt(q.limit, 10) : 50,
        keyword: q.keyword,
        userId: q.userId ? BigInt(q.userId) : undefined,
        startDate: q.startDate ? new Date(q.startDate) : undefined,
        endDate: q.endDate ? new Date(q.endDate) : undefined,
      })
      await reply.send(ok(result.map(serializeChatMessage)))
    },
  )

  /** GET /api/iris/messages/private/:userId — 获取私聊消息列表。 */
  app.get(
    '/api/iris/messages/private/:userId',
    {
      schema: {
        params: UserIdParamSchema,
        querystring: PrivateMessageQuerySchema,
        response: {
          200: OkResponse(MessageListDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { userId: string }
        Querystring: { before?: string; limit?: string }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = app.services.get('iris') as IrisService

      const userId = BigInt(req.params.userId)
      const q = req.query

      const result = await svc.getPrivateHistory(userId, {
        before: q.before ? new Date(q.before) : undefined,
        limit: q.limit ? parseInt(q.limit, 10) : 50,
      })
      await reply.send(ok(result.map(serializeChatMessage)))
    },
  )

  /** GET /api/iris/messages/:messageId/context — 获取消息上下文（前后 N 条）。 */
  app.get(
    '/api/iris/messages/:messageId/context',
    {
      schema: {
        params: MessageIdParamSchema,
        querystring: MessageContextQuerySchema,
        response: {
          200: OkResponse(MessageContextDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { messageId: string }
        Querystring: { createdAt: string; context?: string }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = app.services.get('iris') as IrisService

      const messageId = BigInt(req.params.messageId)
      const createdAt = new Date(req.query.createdAt)
      const contextSize = req.query.context ? parseInt(req.query.context, 10) : 5

      const result = await svc.getMessageContext(messageId, createdAt, contextSize)
      await reply.send(
        ok({
          before: result.before.map(serializeChatMessage),
          current: result.current.map(serializeChatMessage),
          after: result.after.map(serializeChatMessage),
        }),
      )
    },
  )

  /* 归档管理 */

  /** GET /api/iris/archives — 获取归档列表。 */
  app.get(
    '/api/iris/archives',
    {
      schema: {
        querystring: ArchiveListQuerySchema,
        response: {
          200: OkResponse(PaginatedArchivesDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{ Querystring: { page?: string; pageSize?: string } }>,
      reply: FastifyReply,
    ) => {
      const svc = app.services.get('iris_archive') as IrisArchiveService

      const page = req.query.page ? parseInt(req.query.page, 10) : 1
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 20

      const result = await svc.getArchiveLogs(page, pageSize)
      await reply.send(ok(result))
    },
  )

  /** GET /api/iris/archives/query — 查询已完成的归档记录（按起始时间过滤）。 */
  app.get(
    '/api/iris/archives/query',
    {
      schema: {
        querystring: ArchiveQuerySchema,
        response: {
          200: OkResponse(ArchiveQueryDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        // groupId 参数已由 querystring schema 定义，待 IrisArchiveService.listArchives 支持筛选后接入
        Querystring: { periodStart: string; groupId?: string; limit?: string }
      }>,
      reply: FastifyReply,
    ) => {
      const periodStart = new Date(req.query.periodStart)
      if (isNaN(periodStart.getTime())) {
        await reply.status(400).send(fail('periodStart 格式无效，请使用 ISO 8601 格式'))
        return
      }
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50

      const svc = app.services.get('iris_archive') as IrisArchiveService

      const result = await svc.listArchives({ periodStart, limit })
      await reply.send(ok(result))
    },
  )

  /* Iris 搜索与统计 */

  /** GET /api/iris/archives/search — 搜索归档消息索引（关键词 + 条件筛选）。 */
  app.get(
    '/api/iris/archives/search',
    {
      schema: {
        querystring: IrisSearchQuerySchema,
        response: {
          200: OkResponse(IrisSearchDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        Querystring: {
          keyword?: string
          groupId?: string
          userId?: string
          startDate?: string
          endDate?: string
          limit?: number
          offset?: number
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = app.services.get('iris_search')
      const q = req.query

      const options = {
        keyword: q.keyword,
        groupId: q.groupId ? BigInt(q.groupId) : undefined,
        userId: q.userId ? BigInt(q.userId) : undefined,
        startDate: q.startDate ? new Date(q.startDate) : undefined,
        endDate: q.endDate ? new Date(q.endDate) : undefined,
        limit: q.limit ?? 50,
        offset: q.offset ?? 0,
      }

      const [items, total] = await Promise.all([svc.search(options), svc.count(options)])

      const serialized = items.map((item) => ({
        id: String(item.id),
        messageId: Number(item.messageId),
        groupId: item.groupId != null ? Number(item.groupId) : null,
        userId: Number(item.userId),
        textSnippet: item.textSnippet,
        archivedAt: item.createdAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
      }))

      await reply.send(
        ok({ items: serialized, total, limit: options.limit, offset: options.offset }),
      )
    },
  )

  /** GET /api/iris/stats — 获取 Iris 统计信息（当前分区行数、归档阈值）。 */
  app.get(
    '/api/iris/stats',
    {
      schema: {
        response: {
          200: OkResponse(IrisStatsDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const archiveSvc = app.services.get('iris_archive') as IrisArchiveService
      const { total: completedArchives } = await archiveSvc.getArchiveLogs(1, 1)
      await reply.send(ok({ totalMessages: 0, completedArchives }))
    },
  )

  /** POST /api/iris/archives/trigger — 手动触发 Iris 归档任务。 */
  app.post(
    '/api/iris/archives/trigger',
    {
      schema: {
        body: IrisTriggerArchiveBodySchema,
        response: {
          200: OkResponse(IrisTriggerDataSchema),
          500: FailResponse(),
          503: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{ Body?: { groupId?: string; reason?: string } }>,
      reply: FastifyReply,
    ) => {
      const queue = app.services.getOptional('queue') as ArchiveQueue | undefined

      if (!queue) {
        await reply.status(503).send(fail('任务队列未就绪'))
        return
      }

      try {
        const job = await queue.add('iris_archive', {
          trigger: 'manual',
          groupId: req.body?.groupId,
          reason: req.body?.reason,
        })
        await reply.send(ok({ taskId: job.id ?? 'unknown' }, 'Archive task queued'))
      } catch (err) {
        log.error({ err }, 'Iris 归档任务入队失败')
        await reply.status(500).send(fail(`归档任务入队失败: ${String(err)}`))
      }
    },
  )
}

export default irisRoutes
export { irisRoutes }
