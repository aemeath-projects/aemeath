/**
 * Personnel 领域 TypeBox 请求/响应 Schema 定义。
 *
 * 覆盖路由的 Params（路径参数）和 Querystring（查询参数）校验，
 * 通过 Fastify `schema` 选项接入运行时验证。
 */

import { type Static, Type } from '@sinclair/typebox'

/* ──── 公共路径参数 ──── */

/** 用户 ID 路径参数 —— 必须为纯数字非负整数字符串。 */
export const UserIdParamSchema = Type.Object({
  userId: Type.String({ pattern: '^\\d+$', description: 'QQ 号 / 用户 ID' }),
})

/** 群 ID 路径参数 —— 必须为纯数字非负整数字符串。 */
export const GroupIdParamSchema = Type.Object({
  groupId: Type.String({ pattern: '^\\d+$', description: '群号 / 群 ID' }),
})

/* ──── 查询参数（Querystring） ──── */

/** 分页查询用户列表 —— GET /api/personnel/users */
export const UserListQuerySchema = Type.Object({
  page: Type.Optional(Type.String({ pattern: '^\\d+$', description: '页码（默认 1）' })),
  page_size: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '每页条数（默认 20，最大 100）' }),
  ),
  relation: Type.Optional(Type.String({ description: '关系筛选' })),
  qq: Type.Optional(Type.String({ pattern: '^\\d+$', description: '按 QQ 号精确查找' })),
  nickname: Type.Optional(Type.String({ description: '按昵称模糊查找' })),
})

/** 分页查询群列表 —— GET /api/personnel/groups */
export const GroupListQuerySchema = Type.Object({
  page: Type.Optional(Type.String({ pattern: '^\\d+$', description: '页码（默认 1）' })),
  page_size: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '每页条数（默认 20，最大 100）' }),
  ),
  group_name: Type.Optional(Type.String({ description: '按群名模糊查找' })),
  is_active: Type.Optional(
    Type.Union([Type.Literal('true'), Type.Literal('false')], {
      description: '是否活跃：true / false',
    }),
  ),
})

/** 分页查询群成员 —— GET /api/personnel/groups/:groupId/members */
export const MemberListQuerySchema = Type.Object({
  page: Type.Optional(Type.String({ pattern: '^\\d+$', description: '页码（默认 1）' })),
  page_size: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '每页条数（默认 20，最大 100）' }),
  ),
  role: Type.Optional(Type.String({ description: '按角色筛选' })),
  nickname: Type.Optional(Type.String({ description: '按昵称模糊查找' })),
  qq: Type.Optional(Type.String({ pattern: '^\\d+$', description: '按 QQ 号精确查找' })),
})

/* ──── 响应数据 Schema ──── */

/** 管理员信息 Schema。 */
export const AdminInfoSchema = Type.Object({
  qq: Type.Number({ description: 'QQ 号' }),
  nickname: Type.String({ description: '昵称' }),
  relation: Type.String({ description: '关系（admin）' }),
  lastSynced: Type.Union([Type.String(), Type.Null()]),
})

/** 管理员列表响应数据 Schema —— GET /api/personnel/admins */
export const AdminListDataSchema = Type.Array(AdminInfoSchema)

/** 同步状态 Schema —— GET /api/personnel/sync/status */
export const SyncStatusDataSchema = Type.Object({
  lastSyncTime: Type.Union([Type.String(), Type.Null()]),
  durationSeconds: Type.Union([Type.Number(), Type.Null()]),
  status: Type.String(),
  usersSynced: Type.Number(),
  groupsSynced: Type.Number(),
  membershipsSynced: Type.Number(),
})

/* ──── 静态类型推导 ──── */

export type UserListQuery = Static<typeof UserListQuerySchema>
export type GroupListQuery = Static<typeof GroupListQuerySchema>
export type MemberListQuery = Static<typeof MemberListQuerySchema>
