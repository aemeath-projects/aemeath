/**
 * 点赞服务 —— 手动点赞、定时任务注册/取消/查询、批量定时执行。
 */

import { Service, Inject, Provide, Startup } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

import type { LikeTask, LikeHistory, LikeSource, Prisma } from '#prisma/aemeath'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import { isPrismaKnownError } from '@/core/db/index.js'

export type { LikeTask, LikeHistory, LikeSource }

/** 点赞来源枚举有效值集合。 */
export const LIKE_SOURCE_VALUES: readonly string[] = ['manual', 'scheduled']

/* 常量 */

/** 每次点赞的默认次数。 */
const DEFAULT_LIKE_TIMES = 10
/** 批量点赞时各用户间的延迟（毫秒）。 */
const SEND_DELAY_MS = 1000
/** 批量点赞单次最多处理的任务数，防止全量加载内存压力过大。 */
const BATCH_SIZE = 1000

/* 返回值类型 */

/** 注册定时任务的结果。 */
export interface RegisterResult {
  alreadyExists: boolean
}

/** 用户点赞状态查询结果。 */
export interface LikeStatus {
  hasTask: boolean
  totalTimes: number
  lastTriggeredAt: Date | null
}

/** 历史查询参数。 */
export interface ListHistoryParams {
  qq?: string
  source?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}

/** 点赞服务契约。 */
export interface LikeService {
  /** 是否有定时点赞任务正在执行。 */
  readonly isRunning: boolean
  sendLikeNow(qq: string, times: number, source: LikeSource): Promise<boolean>
  registerTask(qq: string, groupId: string | null): Promise<RegisterResult>
  cancelTask(qq: string): Promise<boolean>
  getStatus(qq: string): Promise<LikeStatus>
  listTasks(params?: { page?: number; pageSize?: number }): Promise<[LikeTask[], number]>
  listHistory(params?: ListHistoryParams): Promise<[LikeHistory[], number]>
  requestScheduledLikes(): boolean
}

/**
 * 点赞服务实现 —— 提供手动点赞和每日定时点赞能力。
 *
 * 通过 Startup 生命周期注册，由 LifecycleOrchestrator 管理。
 * run_scheduled_likes() 通过 isRunning + Promise 防止并发重入。
 */
export class LikeServiceImpl implements LikeService {
  private _currentTask: Promise<void> | null = null
  private readonly _log: PinoLogger = getLogger('like') as unknown as PinoLogger

  constructor(
    private readonly db: AemeathPrismaClient,
    private readonly router: MessageRouter,
  ) {}

  // 公共接口

  /** 是否有定时点赞任务正在执行。 */
  get isRunning(): boolean {
    return this._currentTask !== null
  }

  /**
   * 立即调用 send_like API 点赞，并写入历史记录。
   *
   * @param qq - 被点赞用户 QQ（number 或 bigint）
   * @param times - 点赞次数
   * @param source - 触发来源
   */
  async sendLikeNow(qq: string, times: number, source: LikeSource): Promise<boolean> {
    let success = false
    try {
      const result = await this.router.sendLike(qq, times)
      success = result.ok
    } catch (err) {
      this._log.warn({ qq, times, err }, 'send_like 异常')
    }

    // 历史记录写入（失败不影响返回结果）
    try {
      await this.db.likeHistory.create({
        data: {
          qq,
          times,
          triggeredAt: new Date(),
          source,
          success,
        },
      })
    } catch (err) {
      this._log.warn({ qq, times, source, err }, '点赞历史写入失败')
    }

    return success
  }

  /**
   * 注册定时点赞任务。
   *
   * @param qq - 用户 QQ（number 或 bigint）
   * @param groupId - 注册时所在群（私聊注册为 null）
   */
  async registerTask(qq: string, groupId: string | null): Promise<RegisterResult> {
    const existing = await this.db.likeTask.findUnique({
      where: { qq },
      select: { id: true },
    })
    if (existing !== null) {
      return { alreadyExists: true }
    }

    try {
      await this.db.likeTask.create({
        data: {
          qq,
          registeredAt: new Date(),
          registeredGroupId: groupId,
        },
      })
    } catch (err) {
      if (isPrismaKnownError(err) && err.code === 'P2002') {
        // 并发竞争
        return { alreadyExists: true }
      }
      throw err
    }

    return { alreadyExists: false }
  }

  /**
   * 取消定时点赞任务。
   *
   * @returns true 删除成功；false 任务不存在
   */
  async cancelTask(qq: string): Promise<boolean> {
    try {
      await this.db.likeTask.delete({ where: { qq } })
      return true
    } catch (err) {
      if (isPrismaKnownError(err) && err.code === 'P2025') {
        return false
      }
      throw err
    }
  }

  /**
   * 查询用户点赞状态与历史统计。
   */
  async getStatus(qq: string): Promise<LikeStatus> {
    const [taskRow, historyRows] = await Promise.all([
      this.db.likeTask.findUnique({ where: { qq }, select: { id: true } }),
      this.db.likeHistory.aggregate({
        where: { qq, success: true },
        _sum: { times: true },
        _max: { triggeredAt: true },
      }),
    ])

    return {
      hasTask: taskRow !== null,
      totalTimes: historyRows._sum.times ?? 0,
      lastTriggeredAt: historyRows._max.triggeredAt ?? null,
    }
  }

  /**
   * 分页查询所有定时点赞任务。返回 [items, total] 元组。
   */
  async listTasks(
    params: { page?: number; pageSize?: number } = {},
  ): Promise<[LikeTask[], number]> {
    const { page = 1, pageSize = 20 } = params
    const [items, total] = await Promise.all([
      this.db.likeTask.findMany({
        orderBy: { registeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.likeTask.count(),
    ])
    return [items, total]
  }

  /**
   * 分页查询点赞历史记录。返回 [items, total] 元组。
   */
  async listHistory(params: ListHistoryParams = {}): Promise<[LikeHistory[], number]> {
    const { qq, source, dateFrom, dateTo, page = 1, pageSize = 20 } = params

    const where: Prisma.LikeHistoryWhereInput = {
      ...(qq != null ? { qq } : {}),
      ...(source != null ? { source: source as LikeSource } : {}),
      ...(dateFrom != null || dateTo != null
        ? {
            triggeredAt: {
              ...(dateFrom != null ? { gte: dateFrom } : {}),
              ...(dateTo != null ? { lte: dateTo } : {}),
            },
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      this.db.likeHistory.findMany({
        where,
        orderBy: { triggeredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.likeHistory.count({ where }),
    ])

    return [items, total]
  }

  /**
   * 请求执行一轮定时点赞（防并发重入）。
   *
   * @returns true 表示任务已触发，false 表示有任务正在执行（跳过）
   */
  requestScheduledLikes(): boolean {
    if (this.isRunning) {
      this._log.debug('定时点赞任务正在执行，跳过本次触发')
      return false
    }

    this._currentTask = this._runScheduledLikes().finally(() => {
      this._currentTask = null
    })

    return true
  }

  // 内部实现

  private async _runScheduledLikes(): Promise<void> {
    const tasks = await this.db.likeTask.findMany({ select: { qq: true }, take: BATCH_SIZE })
    const total = tasks.length
    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      if (task === undefined) continue
      try {
        const ok = await this.sendLikeNow(task.qq, DEFAULT_LIKE_TIMES, 'scheduled')
        if (ok) {
          successCount++
        } else {
          failedCount++
        }
      } catch (err) {
        this._log.warn({ qq: task.qq, err }, '定时点赞执行异常')
        failedCount++
      }

      if (i < total - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, SEND_DELAY_MS))
      }
    }

    this._log.info({ total, success: successCount, failed: failedCount }, '本轮定时点赞完成')
  }
}

/* 生命周期注册 */

@Service({ name: 'like_bootstrap' })
export class LikeBootstrap {
  /** 注入主数据库 */
  @Inject('db')
  db!: AemeathPrismaClient

  /** 注入消息路由器 */
  @Inject('message_router')
  router!: MessageRouter

  /** 对外暴露点赞服务实例 */
  @Provide('like_service')
  likeService!: LikeService

  @Startup
  start(): void {
    this.likeService = new LikeServiceImpl(this.db, this.router)
  }
}
