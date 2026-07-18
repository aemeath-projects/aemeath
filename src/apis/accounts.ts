/**
 * 账号管理 REST API —— /api/accounts。
 */
import type { Static } from '@sinclair/typebox'
import type { FastifyPluginAsync } from 'fastify'

import {
  CreateAccountBodySchema,
  UpdateAccountBodySchema,
  AccountQqParamsSchema,
  SetPriorityModeBodySchema,
} from './schemas/accounts.js'

import { AccountService, accountStatusBroadcaster } from '@/core/accounts/index.js'
import type { AccountWithStatus } from '@/core/accounts/index.js'
import { ok, fail } from '@/core/schemas/index.js'
import { openSseConnection } from '@/core/utils/index.js'

type QqParams = Static<typeof AccountQqParamsSchema>
type CreateBody = Static<typeof CreateAccountBodySchema>
type UpdateBody = Static<typeof UpdateAccountBodySchema>
type PriorityModeBody = Static<typeof SetPriorityModeBodySchema>

const plugin: FastifyPluginAsync = async (app) => {
  // GET /api/accounts
  app.get('/api/accounts', async (req, reply) => {
    const svc = new AccountService(req.server.services.get('db'))
    const accounts = await svc.listAccounts()
    const result = accounts.map((a) => ({ ...a, qq: a.qq }))
    return reply.send(ok(result))
  })

  // GET /api/accounts/status —— 批量返回账号信息 + 实时连接状态
  app.get('/api/accounts/status', async (req, reply) => {
    const pool = req.server.services.getOptional('account_pool')
    const registry = req.server.services.getOptional('group_bot_registry')
    const svc = new AccountService(
      req.server.services.get('db'),
      pool,
      undefined,
      undefined,
      registry,
    )
    const accounts = await svc.listAccountsWithStatus()
    const result = accounts.map((a) => ({ ...a, qq: a.qq }))
    return reply.send(ok(result))
  })

  // GET /api/accounts/:qq/status
  app.get<{ Params: QqParams }>(
    '/api/accounts/:qq/status',
    { schema: { params: AccountQqParamsSchema } },
    async (req, reply) => {
      const svc = new AccountService(req.server.services.get('db'))
      const account = await svc.getAccount(req.params.qq)
      if (!account) return reply.send(fail('账号不存在'))

      const pool = req.server.services.getOptional('account_pool')
      const clientId = account.qq
      const adapter = pool?.getClient(clientId)

      return reply.send(
        ok({
          qq: account.qq,
          role: account.role,
          state: adapter?.state ?? 'unknown',
        }),
      )
    },
  )

  // POST /api/accounts
  app.post<{ Body: CreateBody }>(
    '/api/accounts',
    { schema: { body: CreateAccountBodySchema } },
    async (req, reply) => {
      const pool = req.server.services.getOptional('account_pool')
      const registry = req.server.services.getOptional('group_bot_registry')
      const svc = new AccountService(
        req.server.services.get('db'),
        pool,
        undefined,
        undefined,
        registry,
      )
      const body = req.body
      if (body.role === 'master') {
        const alreadyHasMaster = await svc.hasMaster()
        if (alreadyHasMaster) return reply.send(fail('主账号已存在，请先移除现有主账号'))
      }
      const account = await svc.createAccount({
        qq: body.qq,
        nickname: body.nickname,
        role: body.role,
        transport: body.transport,
        endpoint: body.endpoint,
        token: body.token,
        isEnabled: body.isEnabled ?? true,
      })
      return reply.send(ok({ ...account, qq: account.qq }))
    },
  )

  // PUT /api/accounts/:qq
  app.put<{ Params: QqParams; Body: UpdateBody }>(
    '/api/accounts/:qq',
    { schema: { params: AccountQqParamsSchema, body: UpdateAccountBodySchema } },
    async (req, reply) => {
      const pool = req.server.services.getOptional('account_pool')
      const registry = req.server.services.getOptional('group_bot_registry')
      const svc = new AccountService(
        req.server.services.get('db'),
        pool,
        undefined,
        undefined,
        registry,
      )
      const existing = await svc.getAccount(req.params.qq)
      if (!existing) return reply.send(fail('账号不存在'))

      const account = await svc.updateAccount(req.params.qq, req.body)
      return reply.send(ok({ ...account, qq: account.qq }))
    },
  )

  // DELETE /api/accounts/:qq
  app.delete<{ Params: QqParams }>(
    '/api/accounts/:qq',
    { schema: { params: AccountQqParamsSchema } },
    async (req, reply) => {
      const svc = new AccountService(req.server.services.get('db'))
      const account = await svc.getAccount(req.params.qq)
      if (!account) return reply.send(fail('账号不存在'))

      const pool = req.server.services.getOptional('account_pool')
      const clientId = account.qq
      if (pool?.getClient(clientId)) await pool.removeClient(clientId)

      await svc.deleteAccount(req.params.qq)
      return reply.send(ok({ message: '已删除' }))
    },
  )

  // GET /api/accounts/priority-mode
  app.get('/api/accounts/priority-mode', async (req, reply) => {
    const settings = req.server.services.get('settings')
    const svc = new AccountService(req.server.services.get('db'), undefined, undefined, settings)
    const mode = await svc.getPriorityMode()
    return reply.send(ok({ mode }))
  })

  // POST /api/accounts/priority-mode
  app.post<{ Body: PriorityModeBody }>(
    '/api/accounts/priority-mode',
    { schema: { body: SetPriorityModeBodySchema } },
    async (req, reply) => {
      const settings = req.server.services.get('settings')
      const router = req.server.services.getOptional('message_router')
      const svc = new AccountService(req.server.services.get('db'), undefined, router, settings)
      await svc.setPriorityMode(req.body.mode)
      return reply.send(ok({ message: '优先级模式已更新', mode: req.body.mode }))
    },
  )

  // GET /api/accounts/stream —— 账号连接状态实时推送
  app.get('/api/accounts/stream', { schema: { hide: true } }, async (req, reply) => {
    const onStatus = (status: AccountWithStatus): void => {
      conn.send(status)
    }

    const conn = openSseConnection(req, reply, () =>
      accountStatusBroadcaster.off('status', onStatus),
    )
    accountStatusBroadcaster.on('status', onStatus)

    await conn.waitForClose()
  })
}

export default plugin
