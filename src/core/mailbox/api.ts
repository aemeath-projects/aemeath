/**
 * 站内信 REST API 路由 —— Fastify 插件，挂载于 /api/mailbox。
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { mailboxBroadcaster } from './broadcast.js'
import {
  MailboxIdParamSchema,
  MailboxListQuerySchema,
  PaginatedMailboxDataSchema,
  UnreadCountDataSchema,
  MailboxSchema,
} from './schemas.js'

import type { Mailbox, MailboxService } from './index.js'

import { NotFoundError, ValidationError } from '@/core/errors.js'
import { ok, fail, OkResponse, FailResponse } from '@/core/schemas/index.js'

function getMailboxService(request: FastifyRequest): MailboxService {
  return request.server.services.get('mailbox') as MailboxService
}

async function handleError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof NotFoundError) {
    await reply.status(404).send(fail(err.message))
    return
  }
  if (err instanceof ValidationError) {
    await reply.status(422).send(fail(err.message))
    return
  }
  const message = err instanceof Error ? err.message : '内部服务器错误'
  await reply.status(500).send(fail(message))
}

function mailboxToDict(m: Mailbox): Record<string, unknown> {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    isRead: m.isRead,
    readAt: m.readAt instanceof Date ? m.readAt.toISOString() : m.readAt,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  }
}

export async function mailboxRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Querystring: { page?: string; pageSize?: string; isRead?: string }
  }>(
    '/',
    {
      schema: {
        querystring: MailboxListQuerySchema,
        response: {
          200: OkResponse(PaginatedMailboxDataSchema),
          422: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      try {
        const { page, pageSize, isRead } = request.query
        const pageNum = Math.max(1, Number(page ?? 1))
        const pageSizeNum = Math.min(100, Math.max(1, Number(pageSize ?? 20)))

        const [items, total] = await getMailboxService(request).listMessages({
          page: pageNum,
          pageSize: pageSizeNum,
          isRead: isRead != null ? isRead === 'true' : undefined,
        })

        await reply.send(
          ok({
            items: items.map((item) => mailboxToDict(item)),
            total,
            page: pageNum,
            pageSize: pageSizeNum,
            pages: Math.ceil(total / pageSizeNum),
          }),
        )
      } catch (err) {
        await handleError(reply, err)
      }
    },
  )

  fastify.get(
    '/unread-count',
    {
      schema: {
        response: {
          200: OkResponse(UnreadCountDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      try {
        const count = await getMailboxService(request).getUnreadCount()
        await reply.send(ok({ count }))
      } catch (err) {
        await handleError(reply, err)
      }
    },
  )

  fastify.post<{ Params: { id: string } }>(
    '/:id/read',
    {
      schema: {
        params: MailboxIdParamSchema,
        response: {
          200: OkResponse(MailboxSchema),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (request, reply) => {
      try {
        const updated = await getMailboxService(request).markRead(request.params.id)
        if (updated === null) {
          throw new NotFoundError(`站内信不存在：${request.params.id}`)
        }
        await reply.send(ok(mailboxToDict(updated)))
      } catch (err) {
        await handleError(reply, err)
      }
    },
  )

  /**
   * GET /api/mailbox/stream — SSE 端点，实时推送新到达的站内信。
   */
  fastify.get('/stream', { schema: { hide: true } }, async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.write('event: connected\ndata: {}\n\n')

    const onMailbox = (item: Mailbox): void => {
      try {
        reply.raw.write(`data: ${JSON.stringify(mailboxToDict(item))}\n\n`)
      } catch {
        // 序列化失败时忽略
      }
    }
    mailboxBroadcaster.on('mailbox', onMailbox)

    const cleanup = (): void => {
      mailboxBroadcaster.off('mailbox', onMailbox)
      reply.raw.end()
    }
    request.raw.on('close', cleanup)

    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve)
    })
  })
}
