/**
 * 用户管理 REST API 路由 —— /api/user。
 */

import { Type } from '@sinclair/typebox'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

import type { AdminService } from './admin.js'
import type { UserQueryService } from './query.js'
import type { SyncCoordinator } from './sync.js'

import type { UserService } from './index.js'

import { ValidationError } from '@/core/errors.js'
import {
  ok,
  fail,
  OkResponse,
  FailResponse,
  UserIdParamSchema,
  GroupIdParamSchema,
  UserListQuerySchema,
  GroupListQuerySchema,
  MemberListQuerySchema,
  AdminListDataSchema,
  AdminCandidateListDataSchema,
  SetAdminBodySchema,
  SyncStatusDataSchema,
  PaginatedUsersDataSchema,
  UserDetailSchema,
  UserGroupsDataSchema,
  PaginatedGroupsDataSchema,
  GroupDetailSchema,
  PaginatedMembersDataSchema,
} from '@/core/schemas/index.js'
function parseBigIntParam(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(`参数 ${name} 必须为非负整数，收到：${value}`)
  }
  return BigInt(value)
}

function getUserService(app: FastifyInstance): UserService {
  return app.services.get('userService') as UserService
}

function getUserQueryService(app: FastifyInstance): UserQueryService {
  return app.services.get('userQueryService') as UserQueryService
}

function getSyncCoordinator(app: FastifyInstance): SyncCoordinator {
  return app.services.get('syncCoordinator') as SyncCoordinator
}

function getAdminService(app: FastifyInstance): AdminService {
  return app.services.get('adminService') as AdminService
}

/** 统一错误映射：ValidationError → 422，其余 → 500（参考 mailbox/api.ts 的错误映射约定；本模块暂无 NotFoundError 场景，故未引入该分支）。 */
async function handleError(reply: FastifyReply, err: unknown): Promise<void> {
  if (err instanceof ValidationError) {
    await reply.status(422).send(fail(err.message))
    return
  }
  const message = err instanceof Error ? err.message : '内部服务器错误'
  await reply.status(500).send(fail(message))
}

/**
 * 注册用户管理 API 路由到 Fastify 实例。
 *
 * 挂载路径前缀：/api/user
 */
export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  /* 用户管理 API */

  /** 分页查询用户列表。 */
  app.get(
    '/api/user/users',
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
      const svc = getUserQueryService(app)
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
    '/api/user/users/:userId',
    {
      schema: {
        params: UserIdParamSchema,
        response: { 200: OkResponse(UserDetailSchema), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const svc = getUserQueryService(app)
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
    '/api/user/users/:userId/groups',
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
      const svc = getUserQueryService(app)
      const groups = await svc.getUserGroups(parseBigIntParam(req.params.userId, 'userId'))
      await reply.send(ok(groups))
    },
  )

  /* 群聊管理 API */

  /** 分页查询群列表。 */
  app.get(
    '/api/user/groups',
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
      const svc = getUserQueryService(app)
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
    '/api/user/groups/:groupId',
    {
      schema: {
        params: GroupIdParamSchema,
        response: { 200: OkResponse(GroupDetailSchema), 404: FailResponse(), 500: FailResponse() },
      },
    },
    async (req: FastifyRequest<{ Params: { groupId: string } }>, reply: FastifyReply) => {
      const svc = getUserQueryService(app)
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
    '/api/user/groups/:groupId/members',
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
      const svc = getUserQueryService(app)
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

  /* 御者管理 API */

  /** 获取当前御者列表（0 或 1 项）。 */
  app.get(
    '/api/user/admins',
    {
      schema: {
        response: {
          200: OkResponse(AdminListDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const svc = getAdminService(app)
      const admins = await svc.getAdmins()
      await reply.send(ok(admins))
    },
  )

  /** 设置/更换御者，仅允许 master 账号好友列表内的 QQ。 */
  app.put(
    '/api/user/admins',
    {
      schema: {
        body: SetAdminBodySchema,
        response: {
          200: OkResponse(Type.Null()),
          422: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (req: FastifyRequest<{ Body: { userId: string } }>, reply: FastifyReply) => {
      try {
        const svc = getAdminService(app)
        await svc.setAdmin(parseBigIntParam(req.body.userId, 'userId'))
        await reply.send(ok(null, '御者已设置'))
      } catch (err) {
        await handleError(reply, err)
      }
    },
  )

  /** 移除当前御者。 */
  app.delete(
    '/api/user/admins',
    {
      schema: {
        response: {
          200: OkResponse(Type.Null()),
          404: FailResponse(),
          422: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const svc = getAdminService(app)
        const success = await svc.removeAdmin()
        if (!success) {
          await reply.status(404).send(fail('当前未设置御者'))
          return
        }
        await reply.send(ok(null, '御者已移除'))
      } catch (err) {
        await handleError(reply, err)
      }
    },
  )

  /** 获取候选人列表（master 账号好友列表），供前端选择框使用。 */
  app.get(
    '/api/user/admin-candidates',
    {
      schema: {
        response: {
          200: OkResponse(AdminCandidateListDataSchema),
          422: FailResponse(),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const svc = getAdminService(app)
        const candidates = await svc.listCandidates()
        await reply.send(
          ok(candidates.map((f) => ({ qq: f.userId, nickname: f.nickname, remark: f.remark }))),
        )
      } catch (err) {
        await handleError(reply, err)
      }
    },
  )

  /* 同步管理 API */

  /** 手动触发一次全量同步。 */
  app.post(
    '/api/user/sync',
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
    '/api/user/sync/status',
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
      const svc = getUserService(app)
      const status = await svc.getSyncStatus()
      await reply.send(ok(status))
    },
  )
}
