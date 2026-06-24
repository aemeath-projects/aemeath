/**
 * 用户管理写操作服务 —— upsert、同步持久化、管理员管理。
 *
 * 只读查询已迁移至 PersonnelQueryService（query.ts）。
 * 增量事件处理已迁移至 PersonnelEventService（events.ts）。
 */

import { Service, Inject, Provide, Startup, Shutdown } from '@aemeath-projects/exostrider/lifecycle'
import type { FriendInfo, GroupInfo, GroupMember } from '@aemeath-projects/napcat/types'

import { USER_RELATION_GLOB } from './cache.js'
import { PersonnelQueryService } from './query.js'
import { SyncCoordinator } from './sync.js'
import type { ConnectionStatus } from './sync.js'

import type { MasterApis, AccountPool } from '@/core/accounts/index.js'
import type { MainPrismaClient } from '@/core/db/index.js'
import type { RedisStore } from '@/core/redis/index.js'
import { cacheKeyRegistry } from '@/core/registries.js'

import './metrics.js'
export { PersonnelQueryService } from './query.js'
export type {
  PaginatedResult,
  UserView,
  GroupView,
  GroupMemberView,
  UserGroupView,
  ResolveResult,
} from './query.js'

/** 用户关系等级。 */
export type UserRelation = 'stranger' | 'group_member' | 'friend' | 'admin'

/** 群成员角色。 */
export type GroupRole = 'owner' | 'admin' | 'member'

/** 同步状态数据结构。 */
export interface SyncStatus {
  lastSyncTime: string | null
  durationSeconds: number | null
  status: string
  usersSynced: number
  groupsSynced: number
  membershipsSynced: number
}

/** 同步结果。 */
export interface SyncResult {
  usersSynced: number
  groupsSynced: number
  membershipsSynced: number
}

/**
 * 根据同步数据计算用户关系等级。
 *
 * 当前 relation 为 admin 时直接返回，不做变更。
 */
export function computeRelation(
  current: UserRelation,
  isInFriendList: boolean,
  hasActiveMembership: boolean,
): UserRelation {
  if (current === 'admin') return 'admin'
  if (isInFriendList) return 'friend'
  if (hasActiveMembership) return 'group_member'
  return 'stranger'
}

/**
 * 用户管理核心服务 —— 封装 upsert、同步编排、缓存管理。
 */
export class PersonnelService {
  constructor(
    private readonly db: MainPrismaClient,
    private readonly cache: RedisStore,
  ) {}

  /* 批量 upsert 操作 */

  /**
   * 批量 upsert 用户。
   *
   * 若用户当前 relation 为 admin，则跳过 relation 更新。
   */
  async upsertUsers(usersData: FriendInfo[], relation: UserRelation = 'stranger'): Promise<number> {
    if (usersData.length === 0) return 0
    const now = new Date()
    let total = 0

    for (const u of usersData) {
      const qq = BigInt(u.userId)
      if (!qq) continue
      const nickname = u.nickname

      await this.db.user.upsert({
        where: { qq },
        create: { qq, nickname, relation, lastSynced: now },
        update: {
          nickname,
          lastSynced: now,
          relation: {
            // 若当前 relation 为 admin 则不更新
          } as never,
        },
      })

      // 手动实现 admin 保护逻辑：先查再写
      const existing = await this.db.user.findUnique({ where: { qq }, select: { relation: true } })
      if (existing && existing.relation !== 'admin') {
        await this.db.user.update({ where: { qq }, data: { relation, nickname, lastSynced: now } })
      } else if (!existing) {
        await this.db.user.create({ data: { qq, nickname, relation, lastSynced: now } })
      } else {
        // admin 用户仅更新 nickname
        await this.db.user.update({ where: { qq }, data: { nickname, lastSynced: now } })
      }
      total++
    }

    return total
  }

  /** 批量 upsert 群聊。 */
  async upsertGroups(groupsData: GroupInfo[]): Promise<number> {
    if (groupsData.length === 0) return 0
    const now = new Date()
    let total = 0

    for (const g of groupsData) {
      const groupId = BigInt(g.groupId)
      if (!groupId) continue

      await this.db.group.upsert({
        where: { groupId },
        create: {
          groupId,
          groupName: g.groupName,
          memberCount: g.memberCount,
          maxMemberCount: g.maxMemberCount,
          isActive: true,
          lastSynced: now,
        },
        update: {
          groupName: g.groupName,
          memberCount: g.memberCount,
          maxMemberCount: g.maxMemberCount,
          isActive: true,
          lastSynced: now,
        },
      })
      total++
    }

    return total
  }

  /**
   * 批量 upsert 群成员关系，并确保用户存在。
   */
  async upsertMemberships(groupId: bigint, membersData: GroupMember[]): Promise<number> {
    if (membersData.length === 0) return 0
    const now = new Date()
    let total = 0

    for (const m of membersData) {
      const qq = BigInt(m.userId)
      if (!qq) continue

      // 确保用户存在（admin/friend 关系不降级）
      const existing = await this.db.user.findUnique({ where: { qq }, select: { relation: true } })
      if (!existing) {
        await this.db.user.create({
          data: { qq, nickname: m.nickname, relation: 'group_member', lastSynced: now },
        })
      } else if (existing.relation !== 'admin' && existing.relation !== 'friend') {
        await this.db.user.update({
          where: { qq },
          data: { nickname: m.nickname, relation: 'group_member', lastSynced: now },
        })
      } else {
        await this.db.user.update({
          where: { qq },
          data: { nickname: m.nickname, lastSynced: now },
        })
      }

      // upsert 成员关系
      await this.db.groupMembership.upsert({
        where: { userId_groupId: { userId: qq, groupId } },
        create: {
          userId: qq,
          groupId,
          card: m.card ?? '',
          role: m.role,
          joinTime: m.joinTime ?? 0,
          lastActiveTime: m.lastSentTime ?? 0,
          title: m.title ?? '',
          titleExpireTime: (m.titleExpireTime as number | undefined) ?? 0,
          level: m.level ?? '',
          isActive: true,
        },
        update: {
          card: m.card ?? '',
          role: m.role,
          joinTime: m.joinTime ?? 0,
          lastActiveTime: m.lastSentTime ?? 0,
          title: m.title ?? '',
          titleExpireTime: (m.titleExpireTime as number | undefined) ?? 0,
          level: m.level ?? '',
          isActive: true,
        },
      })
      total++
    }

    return total
  }

  /* 失效数据清理 */

  /** 将不在最新群列表中的群标记为 is_active=False。 */
  async deactivateStaleGroups(activeGroupIds: Set<bigint>): Promise<void> {
    if (activeGroupIds.size === 0) {
      await this.db.group.updateMany({ data: { isActive: false } })
      return
    }

    await this.db.group.updateMany({
      where: { groupId: { notIn: [...activeGroupIds] }, isActive: true },
      data: { isActive: false },
    })
  }

  /** 将不在最新成员列表中的成员关系标记为 is_active=False。 */
  async deactivateStateMemberships(groupId: bigint, activeUserIds: Set<bigint>): Promise<void> {
    if (activeUserIds.size === 0) {
      await this.db.groupMembership.updateMany({
        where: { groupId, isActive: true },
        data: { isActive: false },
      })
      return
    }

    await this.db.groupMembership.updateMany({
      where: { groupId, userId: { notIn: [...activeUserIds] }, isActive: true },
      data: { isActive: false },
    })
  }

  /* 全量同步持久化 */

  /**
   * 将采集到的用户数据批量持久化到数据库。
   */
  async persistSyncData(
    friends: FriendInfo[] | null,
    groups: GroupInfo[] | null,
    members: Record<number, GroupMember[]> | null,
  ): Promise<SyncResult> {
    const startTime = Date.now()
    let usersSynced = 0
    let groupsSynced = 0
    let membershipsSynced = 0

    const friendQqSet = new Set<bigint>()

    // 1. 同步好友
    if (friends && friends.length > 0) {
      usersSynced = await this._upsertUsersSimple(friends, 'friend')
      for (const f of friends) {
        const qq = BigInt(f.userId)
        if (qq) friendQqSet.add(qq)
      }
    }

    // 2. 同步群聊
    const activeGroupIds = new Set<bigint>()
    if (groups && groups.length > 0) {
      groupsSynced = await this.upsertGroups(groups)
      for (const g of groups) {
        const gid = BigInt(g.groupId)
        if (gid) activeGroupIds.add(gid)
      }
    }

    // 3. 同步群成员
    if (members) {
      for (const [gidStr, memberList] of Object.entries(members)) {
        const gid = BigInt(gidStr)
        membershipsSynced += await this.upsertMemberships(gid, memberList)
        const activeUserIds = new Set<bigint>(
          memberList.map((m) => BigInt(m.userId)).filter((q) => q > 0n),
        )
        await this.deactivateStateMemberships(gid, activeUserIds)
      }
    }

    // 4. 清理失效群
    if (groups !== null) {
      await this.deactivateStaleGroups(activeGroupIds)
    }

    // 5. 重算关系等级
    await this._recalculateRelations(friendQqSet)

    const durationSeconds = (Date.now() - startTime) / 1000

    // 写入 Redis 同步状态
    const statusData: SyncStatus = {
      lastSyncTime: new Date().toISOString(),
      durationSeconds: Math.round(durationSeconds * 1000) / 1000,
      status: 'success',
      usersSynced,
      groupsSynced,
      membershipsSynced,
    }
    await this.cache.set(cacheKeyRegistry.buildKey('personnel', 'sync_status'), statusData, 0)

    // 清除用户关系缓存
    await this._invalidateAllRelationCache()

    return { usersSynced, groupsSynced, membershipsSynced }
  }

  /* 超级管理员管理 */

  /** 设置超级管理员。返回是否成功。 */
  async setAdmin(qq: bigint): Promise<boolean> {
    const user = await this.db.user.findUnique({ where: { qq } })
    if (!user) return false

    await this.db.user.update({ where: { qq }, data: { relation: 'admin' } })
    await this.cache.del(cacheKeyRegistry.buildKey('personnel', 'relation', String(qq)))
    await this.cache.del(cacheKeyRegistry.buildKey('personnel', 'admins'))
    return true
  }

  /** 移除超级管理员，根据当前状态自动降级。返回是否成功。 */
  async removeAdmin(qq: bigint): Promise<boolean> {
    const user = await this.db.user.findUnique({ where: { qq } })
    if (user?.relation !== 'admin') return false

    const hasMembership = await this.db.groupMembership.findFirst({
      where: { userId: qq, isActive: true },
      select: { id: true },
    })

    const newRelation: UserRelation = hasMembership ? 'group_member' : 'stranger'
    await this.db.user.update({ where: { qq }, data: { relation: newRelation } })
    await this.cache.del(cacheKeyRegistry.buildKey('personnel', 'relation', String(qq)))
    await this.cache.del(cacheKeyRegistry.buildKey('personnel', 'admins'))
    return true
  }

  /** 获取所有超级管理员列表。 */
  async getAdmins(): Promise<
    { qq: bigint; nickname: string; relation: string; lastSynced: string | null }[]
  > {
    const admins = await this.db.user.findMany({ where: { relation: 'admin' } })
    return admins.map((r) => ({
      qq: r.qq,
      nickname: r.nickname,
      relation: r.relation,
      lastSynced: r.lastSynced.toISOString(),
    }))
  }

  /** 获取所有超级管理员的 QQ 号集合（带 Redis 缓存）。 */
  async getAdminQqSet(): Promise<Set<bigint>> {
    const key = cacheKeyRegistry.buildKey('personnel', 'admins')
    const cached = await this.cache.get<number[]>(key)
    if (cached !== null && Array.isArray(cached)) {
      return new Set(cached.map((q) => BigInt(q)))
    }

    const rows = await this.db.user.findMany({
      where: { relation: 'admin' },
      select: { qq: true },
    })
    const qqList = rows.map((r) => Number(r.qq))
    await this.cache.set(key, qqList, 300)
    return new Set(rows.map((r) => r.qq))
  }

  /** 获取最近一次同步状态。 */
  async getSyncStatus(): Promise<SyncStatus> {
    const data = await this.cache.get<SyncStatus>(
      cacheKeyRegistry.buildKey('personnel', 'sync_status'),
    )
    if (data !== null && typeof data === 'object') {
      return data
    }
    return {
      lastSyncTime: null,
      durationSeconds: null,
      status: 'never',
      usersSynced: 0,
      groupsSynced: 0,
      membershipsSynced: 0,
    }
  }

  /** 获取用户关系等级（带缓存）。 */
  async getUserRelation(qq: bigint): Promise<string> {
    const key = cacheKeyRegistry.buildKey('personnel', 'relation', String(qq))
    const cached = await this.cache.get<string>(key)
    if (cached !== null) return cached

    const user = await this.db.user.findUnique({ where: { qq }, select: { relation: true } })
    const relation = user?.relation ?? 'stranger'
    await this.cache.set(key, relation, 300)
    return relation
  }

  /* 内部辅助 */

  /** 简化版 upsertUsers（不进行 admin 保护判断，直接批量写入）。 */
  private async _upsertUsersSimple(
    usersData: FriendInfo[],
    relation: UserRelation,
  ): Promise<number> {
    if (usersData.length === 0) return 0
    const now = new Date()
    let total = 0

    for (const u of usersData) {
      const qq = BigInt(u.userId)
      if (!qq) continue
      const nickname = u.nickname

      const existing = await this.db.user.findUnique({ where: { qq }, select: { relation: true } })
      if (!existing) {
        await this.db.user.create({ data: { qq, nickname, relation, lastSynced: now } })
      } else if (existing.relation === 'admin') {
        await this.db.user.update({ where: { qq }, data: { nickname, lastSynced: now } })
      } else {
        await this.db.user.update({ where: { qq }, data: { nickname, relation, lastSynced: now } })
      }
      total++
    }

    return total
  }

  /** 重算所有非 admin 用户的 relation 字段（游标分批，每批 1000 条）。 */
  private async _recalculateRelations(friendQqSet: Set<bigint>): Promise<void> {
    const BATCH_SIZE = 1000
    let cursor: bigint | undefined

    for (;;) {
      const users = await this.db.user.findMany({
        where: {
          relation: { not: 'admin' },
          ...(cursor !== undefined ? { qq: { gt: cursor } } : {}),
        },
        select: { qq: true, relation: true },
        orderBy: { qq: 'asc' },
        take: BATCH_SIZE,
      })

      if (users.length === 0) break

      const userIds = users.map((u) => u.qq)
      const activeMemberRows = await this.db.groupMembership.findMany({
        where: { userId: { in: userIds }, isActive: true },
        select: { userId: true },
        distinct: ['userId'],
      })
      const activeMemberIds = new Set(activeMemberRows.map((r) => r.userId))

      for (const user of users) {
        const hasActiveMembership = activeMemberIds.has(user.qq)
        const isFriend = friendQqSet.has(user.qq)
        const newRelation = computeRelation(user.relation, isFriend, hasActiveMembership)
        if (user.relation !== newRelation) {
          await this.db.user.update({ where: { qq: user.qq }, data: { relation: newRelation } })
        }
      }

      cursor = users.at(-1)?.qq
      if (users.length < BATCH_SIZE) break
    }
  }

  /** 清除所有用户关系缓存。 */
  private async _invalidateAllRelationCache(): Promise<void> {
    try {
      await this.cache.deleteByPattern(USER_RELATION_GLOB)
      await this.cache.del(cacheKeyRegistry.buildKey('personnel', 'admins'))
    } catch {
      // 缓存清除失败不影响主流程
    }
  }
}

/* 生命周期注册 */

@Service({ name: 'personnel_query_bootstrap' })
export class PersonnelQueryBootstrap {
  @Inject('db')
  db!: MainPrismaClient

  @Provide('personnelQueryService')
  personnelQueryService!: PersonnelQueryService

  @Startup
  start(): void {
    this.personnelQueryService = new PersonnelQueryService(this.db)
  }
}

@Service({ name: 'personnel_bootstrap' })
export class PersonnelBootstrap {
  /** 注入主数据库 */
  @Inject('db')
  db!: MainPrismaClient

  /** 注入缓存存储 */
  @Inject('cache')
  cache!: RedisStore

  /** 对外暴露人员服务实例 */
  @Provide('personnelService')
  personnelService!: PersonnelService

  @Startup
  start(): void {
    this.personnelService = new PersonnelService(this.db, this.cache)
  }
}

@Service({ name: 'sync_coordinator_bootstrap' })
export class SyncCoordinatorBootstrap {
  @Inject('master_apis')
  masterApis!: MasterApis

  @Inject('personnelService')
  personnelService!: PersonnelService

  @Inject('account_pool')
  accountPool!: AccountPool

  @Provide('syncCoordinator')
  syncCoordinator!: SyncCoordinator

  @Startup
  start(): void {
    const { friendApi, groupApi } = this.masterApis
    const pool = this.accountPool
    const connStatus: ConnectionStatus = {
      get connected() {
        return pool.getAvailableClients().length > 0
      },
    }

    if (!friendApi || !groupApi) {
      // 无主账号时，创建一个永不执行同步的占位协调器
      this.syncCoordinator = new SyncCoordinator(
        { getFriendList: async () => ({ ok: false, error: 'no master account' }) } as never,
        { getGroupList: async () => ({ ok: false, error: 'no master account' }) } as never,
        this.personnelService,
        { connected: false },
      )
      return
    }

    this.syncCoordinator = new SyncCoordinator(
      friendApi,
      groupApi,
      this.personnelService,
      connStatus,
    )
    this.syncCoordinator.start()
  }

  @Shutdown
  stop(): void {
    this.syncCoordinator.stop()
  }
}
