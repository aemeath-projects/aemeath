/**
 * 每日打卡服务 —— 在已启用群执行 NapCat 签到。
 *
 * 由 BullMQ 每天零点触发；WS 连接建立时亦可触发。
 * 均通过 Redis 日期键去重，防止重复打卡。
 */

import { Service, Inject, Provide, Startup } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { ClientPool } from '@aemeath-projects/exostrider/pool'
import type { GroupApi, FriendApi, NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { AccountRole } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import type { RedisStore } from '@/core/redis/index.js'
import { cacheKeyRegistry } from '@/core/registries.js'
import { Path } from '@/core/settings/index.js'
import type { SettingsService } from '@/core/settings/index.js'
import { SHANGHAI_TZ } from '@/core/utils/index.js'

type AccountPool = ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>

/* 常量 */

/** 打卡 Redis 键 TTL：25 小时（覆盖时区漂移）。 */
const CHECKIN_TTL = 90_000
/** 群间发送延迟（毫秒），避免 QQ 限流。 */
const SEND_DELAY_MS = 1500
/** 此服务对应的功能名。 */
const FEATURE_NAME = 'daily_checkin'

/** 触发来源。 */
export type CheckinSource = 'ws_connect' | 'scheduled'

/* 返回值类型 */

/** 每日打卡执行结果。 */
export interface DailyCheckinResult {
  total: number
  sent: number
  skipped: number
  failed: number
}

/**
 * 每日自动打卡协调器。
 *
 * 由 BullMQ 每天零点触发，WS 连接建立时亦可触发，
 * 均通过 Redis 日期键去重防止重复执行。
 * 打卡 API 使用 NapCat send_group_sign，不发送文本消息。
 */
export class DailyCheckinService {
  private _currentTask: Promise<void> | null = null
  private readonly _log: PinoLogger = getLogger('daily-checkin') as unknown as PinoLogger

  constructor(
    private readonly db: AemeathPrismaClient,
    private readonly cache: RedisStore,
    private readonly groupApi: GroupApi,
    private readonly pool: AccountPool,
    private readonly settings: SettingsService,
  ) {}

  // 公共接口

  /** 是否有打卡任务正在执行。 */
  get isRunning(): boolean {
    return this._currentTask !== null
  }

  /**
   * 请求执行一轮打卡（防并发重入）。
   *
   * @param source - 触发来源
   * @returns true 表示任务已触发，false 表示有任务正在执行（跳过）
   */
  requestCheckin(source: CheckinSource = 'ws_connect'): boolean {
    if (this.isRunning) {
      this._log.debug({ source }, '打卡任务正在执行，跳过')
      return false
    }

    this._currentTask = this._runCheckin(source).finally(() => {
      this._currentTask = null
    })

    return true
  }

  // 内部实现

  private async _runCheckin(source: CheckinSource): Promise<void> {
    if (this.pool.getAvailableClients().length === 0) {
      this._log.warn({ source }, '无可用账号，跳过本轮打卡')
      return
    }

    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: SHANGHAI_TZ }).format(new Date())
    const groupIds = await this._getEligibleGroupIds()

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const groupId of groupIds) {
      // Redis 去重：今日已打卡则跳过
      let alreadyDone: boolean
      try {
        alreadyDone = await this.cache.exists(
          cacheKeyRegistry.buildKey('checkin', 'daily', String(groupId), today),
        )
      } catch (err) {
        this._log.warn({ groupId, err }, 'Redis 查询失败，跳过该群')
        skipped++
        continue
      }

      if (alreadyDone) {
        skipped++
        continue
      }

      // 功能开关：通过 SettingsService 查询群级配置
      let enabled: boolean
      try {
        enabled = await this.settings.get<boolean>(
          `${FEATURE_NAME}.enabled`,
          Path.group(groupId.toString()),
        )
      } catch (err) {
        this._log.warn({ groupId, err }, '功能开关查询失败，跳过该群')
        skipped++
        continue
      }

      if (!enabled) {
        skipped++
        continue
      }

      // 执行打卡
      try {
        const result = await this.groupApi.sendGroupSign(Number(groupId))
        if (!result.ok) {
          this._log.warn(
            { groupId, code: result.error.code, message: result.error.message },
            '群打卡 API 返回失败',
          )
          failed++
        } else {
          await this.cache.set(
            cacheKeyRegistry.buildKey('checkin', 'daily', String(groupId), today),
            '1',
            CHECKIN_TTL,
          )
          sent++
        }
      } catch (err) {
        this._log.warn({ groupId, err }, '群打卡异常')
        failed++
      }

      await new Promise<void>((resolve) => setTimeout(resolve, SEND_DELAY_MS))
    }

    this._log.info({ total: groupIds.length, sent, skipped, failed }, '本轮打卡完成')
  }

  private async _getEligibleGroupIds(): Promise<bigint[]> {
    const rows = await this.db.group.findMany({
      where: { isActive: true },
      select: { groupId: true },
      take: 2000, // 防御性上限，QQ 单账号群上限远低于此值
    })

    // 通过 SettingsService 过滤 bot.enabled=true 的群
    const checks = await Promise.all(
      rows.map(async (r) => {
        const enabled = await this.settings.get<boolean>(
          'bot.enabled',
          Path.group(r.groupId.toString()),
        )
        return enabled ? r.groupId : null
      }),
    )
    return checks.filter((id): id is bigint => id !== null)
  }
}

/* 生命周期注册 */

@Service({ name: 'daily_checkin_bootstrap' })
export class DailyCheckinBootstrap {
  /** 注入主数据库 */
  @Inject('db')
  db!: AemeathPrismaClient

  /** 注入缓存存储 */
  @Inject('cache')
  cache!: RedisStore

  /** 注入主账号 API bundle */
  @Inject('master_apis')
  masterApis!: { groupApi: GroupApi; friendApi: FriendApi }

  /** 注入账号池 */
  @Inject('account_pool')
  pool!: AccountPool

  /** 注入设置服务 */
  @Inject('settings')
  settings!: SettingsService

  /** 对外暴露每日打卡服务实例 */
  @Provide('daily_checkin_service')
  dailyCheckinService!: DailyCheckinService

  @Startup
  start(): void {
    this.dailyCheckinService = new DailyCheckinService(
      this.db,
      this.cache,
      this.masterApis.groupApi,
      this.pool,
      this.settings,
    )
  }
}
