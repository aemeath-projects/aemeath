/**
 * 御者（超级管理员）管理服务 —— 候选校验、全局唯一性保证、缓存。
 */

import { Service, Inject, Provide, Startup } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { FriendInfo } from '@aemeath-projects/napcat/types'

import './cache.js'
import type { UserRelation } from './index.js'

import type { MasterApis } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import { ValidationError } from '@/core/errors.js'
import type { RedisStore } from '@/core/redis/index.js'
import { cacheKeyRegistry } from '@/core/registries.js'

/** 御者设置/移除临界区分布式锁 TTL（毫秒）—— 覆盖一次事务的正常耗时并留出余量。 */
const ADMIN_LOCK_TTL_MS = 5000

/** 御者视图（用于 REST /admins 和站内信）。 */
export interface AdminView {
  qq: bigint
  nickname: string
  relation: string
  lastSynced: string | null
}

/**
 * 御者管理核心服务 —— 从 UserService 拆出，独立文件承载单一职责。
 */
export class AdminService {
  private readonly _log: PinoLogger = getLogger('user:admin') as unknown as PinoLogger

  constructor(
    private readonly db: AemeathPrismaClient,
    private readonly cache: RedisStore,
    private readonly masterApis: MasterApis,
  ) {}

  /** 设置/更换御者，仅允许 master 账号好友列表内的 QQ。 */
  async setAdmin(qq: bigint): Promise<void> {
    if (!this.masterApis.friendApi) {
      throw new ValidationError('master 账号未在线，无法设置御者')
    }
    const friends = await this.masterApis.friendApi.getFriendList()
    if (!friends.ok) {
      throw new ValidationError('获取好友列表失败')
    }
    if (!friends.data.some((f) => BigInt(f.userId) === qq)) {
      throw new ValidationError('目标 QQ 不在 master 账号好友列表中，无法设置为御者')
    }

    await this.withAdminLock(async () => {
      const previousQq = await this.db.$transaction(async (tx) => {
        const current = await tx.user.findFirst({ where: { relation: 'admin' } })
        if (current && current.qq !== qq) {
          const isFriend = friends.data.some((f) => BigInt(f.userId) === current.qq)
          let newRelation: UserRelation
          if (isFriend) {
            newRelation = 'friend'
          } else {
            const hasMembership = await tx.groupMembership.findFirst({
              where: { userId: current.qq, isActive: true },
            })
            newRelation = hasMembership ? 'group_member' : 'stranger'
          }
          await tx.user.update({ where: { qq: current.qq }, data: { relation: newRelation } })
        }
        await tx.user.upsert({
          where: { qq },
          create: {
            qq,
            nickname: friends.data.find((f) => BigInt(f.userId) === qq)?.nickname ?? '',
            relation: 'admin',
          },
          update: { relation: 'admin' },
        })
        return current && current.qq !== qq ? current.qq : null
      })

      await this._safeDelCache(cacheKeyRegistry.buildKey('user', 'relation', String(qq)))
      if (previousQq !== null) {
        await this._safeDelCache(cacheKeyRegistry.buildKey('user', 'relation', String(previousQq)))
      }
      await this._invalidateAdminCache()
    })
  }

  /** 移除当前御者（不传参，因为全局只有一个）。返回是否成功。 */
  async removeAdmin(): Promise<boolean> {
    return this.withAdminLock(async () => {
      const user = await this.db.user.findFirst({ where: { relation: 'admin' } })
      if (!user) return false

      // 注意：此处降级只检查群成员关系，不查好友列表（removeAdmin 设计上不依赖 master 在线，
      // 即使 master 离线也能移除御者）。若被移除者仍是好友，relation 会短暂降级不精确，
      // 待下次 SyncCoordinator 全量同步会纠正。这是有意为之的设计取舍。
      const hasMembership = await this.db.groupMembership.findFirst({
        where: { userId: user.qq, isActive: true },
      })
      const newRelation: UserRelation = hasMembership ? 'group_member' : 'stranger'
      await this.db.user.update({ where: { qq: user.qq }, data: { relation: newRelation } })

      await this._safeDelCache(cacheKeyRegistry.buildKey('user', 'relation', String(user.qq)))
      await this._invalidateAdminCache()
      return true
    })
  }

  /**
   * 用分布式锁包住"读当前御者→降级旧的→升级/移除"临界区，保证全局唯一性。
   *
   * setAdmin/removeAdmin 共用同一把锁（cache key 'admin_lock'），避免并发互相踩踏。
   */
  private async withAdminLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockKey = cacheKeyRegistry.buildKey('user', 'admin_lock')
    const acquired = await this.cache.setNx(lockKey, '1', ADMIN_LOCK_TTL_MS)
    if (!acquired) {
      throw new ValidationError('御者设置操作正在进行中，请稍后重试')
    }
    try {
      return await fn()
    } finally {
      await this.cache.del(lockKey)
    }
  }

  /** 获取当前御者列表（0 或 1 项），供 REST /admins 和站内信使用。 */
  async getAdmins(): Promise<AdminView[]> {
    const admins = await this.db.user.findMany({ where: { relation: 'admin' } })
    return admins.map((r) => ({
      qq: r.qq,
      nickname: r.nickname,
      relation: r.relation,
      lastSynced: r.lastSynced.toISOString(),
    }))
  }

  /** 获取当前御者 QQ（无则为 null），带 Redis 缓存，供权限检查用。 */
  async getAdminQq(): Promise<bigint | null> {
    const key = cacheKeyRegistry.buildKey('user', 'admin')
    const cached = await this.cache.get<string>(key)
    if (cached !== null) return cached === '' ? null : BigInt(cached)

    const admin = await this.db.user.findFirst({ where: { relation: 'admin' } })
    await this.cache.set(key, admin ? String(admin.qq) : '', 300)
    return admin?.qq ?? null
  }

  /** 获取候选人列表（master 好友列表），供前端选择框使用，不缓存。无主账号时返回空列表。 */
  async listCandidates(): Promise<FriendInfo[]> {
    if (!this.masterApis.friendApi) {
      return []
    }
    const result = await this.masterApis.friendApi.getFriendList()
    if (!result.ok) {
      return []
    }
    return result.data
  }

  /** 清除御者 QQ 缓存。 */
  private async _invalidateAdminCache(): Promise<void> {
    await this._safeDelCache(cacheKeyRegistry.buildKey('user', 'admin'))
  }

  /** 安全删除缓存 key：失败仅记录日志，不让缓存清理异常掩盖主流程结果（DB 已写成功）。 */
  private async _safeDelCache(key: string): Promise<void> {
    try {
      await this.cache.del(key)
    } catch (err) {
      this._log.error({ key, err }, '御者缓存清理失败')
    }
  }
}

/* 生命周期注册 */

@Service({ name: 'admin_bootstrap' })
export class AdminBootstrap {
  /** 注入主数据库 */
  @Inject('db')
  db!: AemeathPrismaClient

  /** 注入缓存存储 */
  @Inject('cache')
  cache!: RedisStore

  /** 注入主账号 API bundle（MultiAccountBootstrap 可能在 AdminBootstrap 之后初始化，因此可能未定义） */
  @Inject('master_apis')
  masterApis?: MasterApis

  /** 对外暴露御者管理服务实例 */
  @Provide('adminService')
  adminService!: AdminService

  @Startup
  start(): void {
    this.adminService = new AdminService(
      this.db,
      this.cache,
      this.masterApis ?? { msgApi: null, groupApi: null, friendApi: null },
    )
  }
}
