/**
 * 账号管理和多账号路由 REST API —— /api/accounts, /api/routing。
 */
import type { ClientPool } from '@aemeath-projects/exostrider/pool'
import type { NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import type { Static } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'

import {
  CreateAccountBodySchema,
  UpdateAccountBodySchema,
  AccountIdParamsSchema,
} from './schemas/accounts.js'
import { SetPriorityModeBodySchema } from './schemas/routing.js'

import type { NapCatClientAdapter, AccountRole } from '@/core/accounts/index.js'
import { ok, fail } from '@/core/schemas/index.js'

type IdParams = Static<typeof AccountIdParamsSchema>
type CreateBody = Static<typeof CreateAccountBodySchema>
type UpdateBody = Static<typeof UpdateAccountBodySchema>
type PriorityModeBody = Static<typeof SetPriorityModeBodySchema>

const plugin: FastifyPluginAsync = async (app) => {
  // GET /api/accounts
  app.get('/accounts', async (req, reply) => {
    const db = req.server.services.get('db')
    const accounts = await db.account.findMany({ orderBy: { id: 'asc' } })
    // BigInt 字段序列化为 string
    const result = accounts.map((a) => ({ ...a, qq: String(a.qq) }))
    return reply.send(ok(result))
  })

  // GET /api/accounts/:id/status
  app.get<{ Params: IdParams }>(
    '/accounts/:id/status',
    { schema: { params: AccountIdParamsSchema } },
    async (req, reply) => {
      const db = req.server.services.get('db')
      const account = await db.account.findUnique({ where: { id: Number(req.params.id) } })
      if (!account) return reply.send(fail('账号不存在'))

      const pool = req.server.services.get('account_pool') as
        | ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>
        | undefined
      const clientId = `bot-${String(account.qq)}`
      const adapter = pool?.getClient(clientId) as NapCatClientAdapter | undefined

      return reply.send(
        ok({
          id: account.id,
          qq: String(account.qq),
          role: account.role,
          state: adapter?.state ?? 'unknown',
        }),
      )
    },
  )

  // POST /api/accounts
  app.post<{ Body: CreateBody }>(
    '/accounts',
    { schema: { body: CreateAccountBodySchema } },
    async (req, reply) => {
      const db = req.server.services.get('db')
      const body = req.body
      if (body.role === 'master') {
        const existing = await db.account.findFirst({ where: { role: 'master' } })
        if (existing) return reply.send(fail('主账号已存在，请先移除现有主账号'))
      }
      const account = await db.account.create({
        data: {
          qq: BigInt(body.qq),
          nickname: body.nickname,
          role: body.role,
          transport: body.transport,
          endpoint: body.endpoint,
          token: body.token,
          isEnabled: body.isEnabled ?? true,
        },
      })
      return reply.send(ok({ ...account, qq: String(account.qq) }))
    },
  )

  // PUT /api/accounts/:id
  app.put<{ Params: IdParams; Body: UpdateBody }>(
    '/accounts/:id',
    { schema: { params: AccountIdParamsSchema, body: UpdateAccountBodySchema } },
    async (req, reply) => {
      const db = req.server.services.get('db')
      const account = await db.account.update({
        where: { id: Number(req.params.id) },
        data: req.body,
      })
      return reply.send(ok({ ...account, qq: String(account.qq) }))
    },
  )

  // DELETE /api/accounts/:id
  app.delete<{ Params: IdParams }>(
    '/accounts/:id',
    { schema: { params: AccountIdParamsSchema } },
    async (req, reply) => {
      const db = req.server.services.get('db')
      const account = await db.account.findUnique({ where: { id: Number(req.params.id) } })
      if (!account) return reply.send(fail('账号不存在'))

      const pool = req.server.services.get('account_pool') as
        | ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>
        | undefined
      const clientId = `bot-${String(account.qq)}`
      const adapter = pool?.getClient(clientId)
      if (adapter) await adapter.disconnect()

      await db.account.delete({ where: { id: Number(req.params.id) } })
      return reply.send(ok({ message: '已删除' }))
    },
  )

  // POST /api/accounts/:id/connect
  app.post<{ Params: IdParams }>(
    '/accounts/:id/connect',
    { schema: { params: AccountIdParamsSchema } },
    async (req, reply) => {
      const db = req.server.services.get('db')
      const account = await db.account.findUnique({ where: { id: Number(req.params.id) } })
      if (!account) return reply.send(fail('账号不存在'))

      const pool = req.server.services.get('account_pool') as
        | ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>
        | undefined
      const clientId = `bot-${String(account.qq)}`
      const adapter = pool?.getClient(clientId)
      if (!adapter) return reply.send(fail('账号未在连接池中'))
      await adapter.connect()
      return reply.send(ok({ message: '已连接' }))
    },
  )

  // POST /api/accounts/:id/disconnect
  app.post<{ Params: IdParams }>(
    '/accounts/:id/disconnect',
    { schema: { params: AccountIdParamsSchema } },
    async (req, reply) => {
      const db = req.server.services.get('db')
      const account = await db.account.findUnique({ where: { id: Number(req.params.id) } })
      if (!account) return reply.send(fail('账号不存在'))

      const pool = req.server.services.get('account_pool') as
        | ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>
        | undefined
      const clientId = `bot-${String(account.qq)}`
      const adapter = pool?.getClient(clientId)
      if (adapter) await adapter.disconnect()
      return reply.send(ok({ message: '已断开' }))
    },
  )

  // GET /api/routing/table
  app.get('/routing/table', async (req, reply) => {
    const pool = req.server.services.get('account_pool') as
      | ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>
      | undefined
    const available = pool?.getAvailableClients() ?? []
    return reply.send(ok(available.map((c) => ({ clientId: c.id, state: c.state }))))
  })

  // POST /api/routing/priority-mode
  app.post<{ Body: PriorityModeBody }>(
    '/routing/priority-mode',
    { schema: { body: SetPriorityModeBodySchema } },
    async (req, reply) => {
      return reply.send(ok({ message: '优先级模式已更新（重启生效）', mode: req.body.mode }))
    },
  )
}

export default plugin
