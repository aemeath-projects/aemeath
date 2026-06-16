/**
 * 聊天记录 REST API 路由 —— /api/chat。
 */

import { getLogger } from '@logger'
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
  ArchiveTriggerBodySchema,
  MessageListDataSchema,
  MessageContextDataSchema,
  PaginatedArchivesDataSchema,
  ArchiveQueryDataSchema,
  ArchiveTriggerDataSchema,
} from '@/apis/schemas/index.js'
import { ok, fail, OkResponse, FailResponse } from '@/core/schemas/index.js'

const log = getLogger('chat')

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
 * 聊天记录管理路由插件。
 */
const chatRoutes: FastifyPluginAsync = async (app) => {
  /* 消息查询 */

  /** GET /api/chat/messages/group/:groupId — 获取群聊消息列表（游标分页）。 */
  app.get(
    '/api/chat/messages/group/:groupId',
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
      const { ChatHistoryService } = await import('@/core/chat/index.js')

      const svc = app.services.getTyped(ChatHistoryService, 'chat_service')

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

  /** GET /api/chat/messages/private/:userId — 获取私聊消息列表。 */
  app.get(
    '/api/chat/messages/private/:userId',
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
      const { ChatHistoryService } = await import('@/core/chat/index.js')

      const svc = app.services.getTyped(ChatHistoryService, 'chat_service')

      const userId = BigInt(req.params.userId)
      const q = req.query

      const result = await svc.getPrivateHistory(userId, {
        before: q.before ? new Date(q.before) : undefined,
        limit: q.limit ? parseInt(q.limit, 10) : 50,
      })
      await reply.send(ok(result.map(serializeChatMessage)))
    },
  )

  /** GET /api/chat/messages/:messageId/context — 获取消息上下文（前后 N 条）。 */
  app.get(
    '/api/chat/messages/:messageId/context',
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
      const { ChatHistoryService } = await import('@/core/chat/index.js')

      const svc = app.services.getTyped(ChatHistoryService, 'chat_service')

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

  /** GET /api/chat/archives — 获取归档列表。 */
  app.get(
    '/api/chat/archives',
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
      const { ArchiveService } = await import('@/core/chat/archive.js')

      const svc = app.services.getTyped(ArchiveService, 'archive_service')

      const page = req.query.page ? parseInt(req.query.page, 10) : 1
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 20

      const result = await svc.getArchiveLogs(page, pageSize)
      await reply.send(ok(result))
    },
  )

  /** POST /api/chat/archives/trigger — 手动触发归档任务（发送 BullMQ job）。 */
  app.post(
    '/api/chat/archives/trigger',
    {
      schema: {
        body: ArchiveTriggerBodySchema,
        response: {
          200: OkResponse(ArchiveTriggerDataSchema),
          500: FailResponse(),
          503: FailResponse(),
        },
      },
    },
    async (req: FastifyRequest<{ Body?: { partitionName?: string } }>, reply: FastifyReply) => {
      const queues = app.services.get('queues') as Record<string, ArchiveQueue> | undefined

      const archiveQueue = queues?.['chat-archive']
      if (archiveQueue === undefined) {
        await reply.status(503).send(fail('归档队列未就绪'))
        return
      }

      const partitionName = req.body?.partitionName
      try {
        const job = await archiveQueue.add('archive_chat_history', { partitionName })
        await reply.send(ok({ task_id: job.id ?? 'unknown' }, 'Archive task queued'))
      } catch (err) {
        log.error({ err }, '归档任务入队失败')
        await reply.status(500).send(fail(`归档任务入队失败: ${String(err)}`))
      }
    },
  )

  /** GET /api/chat/archives/query — 查询已完成的归档记录（按起始时间过滤）。 */
  app.get(
    '/api/chat/archives/query',
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
        // TODO: groupId 参数已由 querystring schema 定义但未在 handler 中使用，
        // 待 ArchiveService.listArchives 支持 groupId 筛选后接入
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

      const { ArchiveService } = await import('@/core/chat/archive.js')
      const svc = app.services.getTyped(ArchiveService, 'archive_service')

      const result = await svc.listArchives({ periodStart, limit })
      await reply.send(ok(result))
    },
  )
}

export default chatRoutes
export { chatRoutes }
