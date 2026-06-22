/**
 * 用户管理 REST API 路由 —— /api/personnel。
 */

import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

import type { PersonnelQueryService } from './query.js'
import type { SyncCoordinator } from './sync.js'

import type { PersonnelService } from './index.js'

import { ValidationError } from '@/core/errors.js'
import { ok, fail, OkResponse, FailResponse } from '@/core/schemas/index.js'
import {
  UserIdParamSchema,
  GroupIdParamSchema,
  UserListQuerySchema,
  GroupListQuerySchema,
  MemberListQuerySchema,
  AdminListDataSchema,
  SyncStatusDataSchema,
  PaginatedUsersDataSchema,
  UserDetailSchema,
  UserGroupsDataSchema,
  PaginatedGroupsDataSchema,
  GroupDetailSchema,
  PaginatedMembersDataSchema,
} from '@/core/schemas/personnel.js'
function parseBigIntParam(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(`参数 ${name} 必须为非负整数，收到：${value}`)
  }
  return BigInt(value)
}

function getPersonnelService(app: FastifyInstance): PersonnelService {
  return app.services.get('personnelService') as PersonnelService
}

function getPersonnelQueryService(app: FastifyInstance): PersonnelQueryService {
  return app.services.get('personnelQueryService') as PersonnelQueryService
}

function getSyncCoordinator(app: FastifyInstance): SyncCoordinator {
  return app.services.get('syncCoordinator') as SyncCoordinator
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
    {
      schema: {
        querystring: UserListQuerySchema,
        response: {
          200: OkResponse(PaginatedUsersDataSchema),
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
          relation?: string
          qq?: string
          nickname?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = getPersonnelQueryService(app)
      const page = Math.max(1, Number(req.query.page ?? 1))
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)))
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
    {
      schema: {
        params: UserIdParamSchema,
        response: { 200: OkResponse(UserDetailSchema), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const svc = getPersonnelQueryService(app)
      const user = await svc.getUser(parseBigIntParam(req.params.userId, 'userId'))
      if (!user) {
        await reply.status(404).send(fail('User not found'))
        return
      }
      await reply.send(ok(user))
    },
  )

  /** 获取用户所属的所有群聊。 */
  app.get(
    '/api/personnel/users/:userId/groups',
    {
      schema: {
        params: UserIdParamSchema,
        response: {
          200: OkResponse(UserGroupsDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
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
    {
      schema: {
        querystring: GroupListQuerySchema,
        response: {
          200: OkResponse(PaginatedGroupsDataSchema),
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
          groupName?: string
          isActive?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const svc = getPersonnelQueryService(app)
      const isActive =
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined
      const result = await svc.listGroups({
        page: Math.max(1, Number(req.query.page ?? 1)),
        pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20))),
        groupName: req.query.groupName,
        isActive,
      })
      await reply.send(ok(result))
    },
  )

  /** 获取单个群聊详情。 */
  app.get(
    '/api/personnel/groups/:groupId',
    {
      schema: {
        params: GroupIdParamSchema,
        response: { 200: OkResponse(GroupDetailSchema), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Params: { groupId: string } }>, reply: FastifyReply) => {
      const svc = getPersonnelQueryService(app)
      const group = await svc.getGroup(parseBigIntParam(req.params.groupId, 'groupId'))
      if (!group) {
        await reply.status(404).send(fail('Group not found'))
        return
      }
      await reply.send(ok(group))
    },
  )

  /** 分页获取群成员列表。 */
  app.get(
    '/api/personnel/groups/:groupId/members',
    {
      schema: {
        params: GroupIdParamSchema,
        querystring: MemberListQuerySchema,
        response: {
          200: OkResponse(PaginatedMembersDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { groupId: string }
        Querystring: {
          page?: string
          pageSize?: string
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
        pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20))),
        role: req.query.role,
        nickname: req.query.nickname,
        qq: req.query.qq !== undefined ? parseBigIntParam(req.query.qq, 'qq') : undefined,
      })
      await reply.send(ok(result))
    },
  )

  /* 超级管理员管理 API */

  /** 获取所有超级管理员列表。 */
  app.get(
    '/api/personnel/admins',
    {
      schema: {
        response: {
          200: OkResponse(AdminListDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const svc = getPersonnelService(app)
      const admins = await svc.getAdmins()
      await reply.send(ok(admins))
    },
  )

  /** 添加超级管理员。 */
  app.post(
    '/api/personnel/admins/:userId',
    {
      schema: {
        params: UserIdParamSchema,
        response: {
          200: OkResponse(Type.Null()),
          400: FailResponse(),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
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
    {
      schema: {
        params: UserIdParamSchema,
        response: {
          200: OkResponse(Type.Null()),
          400: FailResponse(),
          404: FailResponse(),
          500: FailResponse(),
        },
      },
    },
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
  app.post(
    '/api/personnel/sync',
    {
      schema: {
        response: {
          200: OkResponse(Type.Null()),
          409: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const coordinator = getSyncCoordinator(app)
      const task = coordinator.requestSync('manual')
      if (task === null) {
        await reply.send(ok(null, 'Sync already in progress, skipped'))
        return
      }
      await reply.send(ok(null, 'Sync triggered'))
    },
  )

  /** 获取最近一次同步的状态。 */
  app.get(
    '/api/personnel/sync/status',
    {
      schema: {
        response: {
          200: OkResponse(SyncStatusDataSchema),
          400: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const svc = getPersonnelService(app)
      const status = await svc.getSyncStatus()
      await reply.send(ok(status))
    },
  )
}
