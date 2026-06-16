/**
 * 用户管理 REST API 路由 —— /api/personnel。
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

import { PersonnelQueryService } from './query.js'
import { SyncCoordinator } from './sync.js'

import { PersonnelService } from './index.js'

import { NotFoundError, ValidationError } from '@/core/errors.js'
import { ok, fail } from '@/core/response.js'

/** 安全解析 BigInt 路径/查询参数，格式无效时抛出 ValidationError。 */
function parseBigIntParam(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(`参数 ${name} 必须为非负整数，收到：${value}`)
  }
  return BigInt(value)
}

function getPersonnelService(app: FastifyInstance): PersonnelService {
  return app.services.getTyped(PersonnelService, 'personnelService')
}

function getPersonnelQueryService(app: FastifyInstance): PersonnelQueryService {
  return app.services.getTyped(PersonnelQueryService, 'personnelQueryService')
}

function getSyncCoordinator(app: FastifyInstance): SyncCoordinator {
  return app.services.getTyped(SyncCoordinator, 'syncCoordinator')
}

/**
 * 注册人员管理 API 路由到 Fastify 实例。
 *
 * 挂载路径前缀：/api/personnel
 */
export async function registerPersonnelRoutes(app: FastifyInstance): Promise<void> {
  /* 用户管理 API */

  /** 分页查询用户列表。 */
  app.get(
    '/api/personnel/users',
    async (
      req: FastifyRequest<{
        Querystring: {
          page?: string
          page_size?: string
          relation?: string
          qq?: string
          nickname?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = getPersonnelQueryService(app)
      const page = Math.max(1, Number(req.query.page ?? 1))
      const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size ?? 20)))
      const qq = req.query.qq !== undefined ? parseBigIntParam(req.query.qq, 'qq') : undefined
      const result = await svc.listUsers({
        page,
        pageSize,
        relation: req.query.relation,
        qq,
        nickname: req.query.nickname,
      })
      await reply.send(ok(result))
    },
  )

  /** 获取单个用户详情。 */
  app.get(
    '/api/personnel/users/:userId',
    async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const svc = getPersonnelQueryService(app)
      const user = await svc.getUser(parseBigIntParam(req.params.userId, 'userId'))
      if (!user) {
        throw new NotFoundError('User not found')
      }
      await reply.send(ok(user))
    },
  )

  /** 获取用户所属的所有群聊。 */
  app.get(
    '/api/personnel/users/:userId/groups',
    async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const svc = getPersonnelQueryService(app)
      const groups = await svc.getUserGroups(parseBigIntParam(req.params.userId, 'userId'))
      await reply.send(ok(groups))
    },
  )

  /* 群聊管理 API */

  /** 分页查询群列表。 */
  app.get(
    '/api/personnel/groups',
    async (
      req: FastifyRequest<{
        Querystring: {
          page?: string
          page_size?: string
          group_name?: string
          is_active?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = getPersonnelQueryService(app)
      const isActive =
        req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined
      const result = await svc.listGroups({
        page: Math.max(1, Number(req.query.page ?? 1)),
        pageSize: Math.min(100, Math.max(1, Number(req.query.page_size ?? 20))),
        groupName: req.query.group_name,
        isActive,
      })
      await reply.send(ok(result))
    },
  )

  /** 获取单个群聊详情。 */
  app.get(
    '/api/personnel/groups/:groupId',
    async (req: FastifyRequest<{ Params: { groupId: string } }>, reply: FastifyReply) => {
      const svc = getPersonnelQueryService(app)
      const group = await svc.getGroup(parseBigIntParam(req.params.groupId, 'groupId'))
      if (!group) {
        throw new NotFoundError('Group not found')
      }
      await reply.send(ok(group))
    },
  )

  /** 分页获取群成员列表。 */
  app.get(
    '/api/personnel/groups/:groupId/members',
    async (
      req: FastifyRequest<{
        Params: { groupId: string }
        Querystring: {
          page?: string
          page_size?: string
          role?: string
          nickname?: string
          qq?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = getPersonnelQueryService(app)
      const result = await svc.listGroupMembers(parseBigIntParam(req.params.groupId, 'groupId'), {
        page: Math.max(1, Number(req.query.page ?? 1)),
        pageSize: Math.min(100, Math.max(1, Number(req.query.page_size ?? 20))),
        role: req.query.role,
        nickname: req.query.nickname,
        qq: req.query.qq !== undefined ? parseBigIntParam(req.query.qq, 'qq') : undefined,
      })
      await reply.send(ok(result))
    },
  )

  /* 超级管理员管理 API */

  /** 获取所有超级管理员列表。 */
  app.get('/api/personnel/admins', async (_req: FastifyRequest, reply: FastifyReply) => {
    const svc = getPersonnelService(app)
    const admins = await svc.getAdmins()
    await reply.send(ok(admins))
  })

  /** 添加超级管理员。 */
  app.post(
    '/api/personnel/admins/:userId',
    async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const svc = getPersonnelService(app)
      const success = await svc.setAdmin(parseBigIntParam(req.params.userId, 'userId'))
      if (!success) {
        await reply.status(404).send(fail('User not found'))
        return
      }
      await reply.send(ok(null, 'Admin set successfully'))
    },
  )

  /** 移除超级管理员。 */
  app.delete(
    '/api/personnel/admins/:userId',
    async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const svc = getPersonnelService(app)
      const success = await svc.removeAdmin(parseBigIntParam(req.params.userId, 'userId'))
      if (!success) {
        await reply.status(404).send(fail('User not found or not an admin'))
        return
      }
      await reply.send(ok(null, 'Admin removed successfully'))
    },
  )

  /* 同步管理 API */

  /** 手动触发一次全量同步。 */
  app.post('/api/personnel/sync', async (_req: FastifyRequest, reply: FastifyReply) => {
    const coordinator = getSyncCoordinator(app)
    const task = coordinator.requestSync('manual')
    if (task === null) {
      await reply.send(ok(null, 'Sync already in progress, skipped'))
      return
    }
    await reply.send(ok(null, 'Sync triggered'))
  })

  /** 获取最近一次同步的状态。 */
  app.get('/api/personnel/sync/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const svc = getPersonnelService(app)
    const status = await svc.getSyncStatus()
    await reply.send(ok(status))
  })
}
