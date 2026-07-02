/**
 * 聊天记录归档服务 —— 按群归档，_discoverGroupCycles，僵尸检测，分批 DELETE。
 */

import { rm } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

import type { ArchiveStatus } from '#prisma/iris'

import { IrisExporter } from './exporter.js'
import type { ArchiveExporterSettings } from './exporter.js'
import { IrisS3 } from './s3.js'

import type { IrisPrismaClient, MainPrismaClient } from '@/core/db/index.js'

/** 单群归档结果。 */
export interface GroupArchiveResult {
  groupId: string
  status: 'completed' | 'empty' | 'failed'
  rows?: number
  originalBytes?: number
  compressedBytes?: number
  s3Key?: string
  error?: string
}

/** 归档入口结果。 */
export interface ArchiveResult {
  status: 'completed' | 'no_groups'
  results?: GroupArchiveResult[]
}

/** BullMQ job data 结构。 */
export interface ArchiveJobData {
  groupId?: string // BigInt 序列化为 string
}

/**
 * 聊天记录归档编排服务 —— 按群 + 时间段归档，_discoverGroupCycles，僵尸检测，分批 DELETE。
 */
export class IrisArchiveService {
  private readonly exporter: IrisExporter
  private readonly _log: PinoLogger = getLogger('iris:archive') as unknown as PinoLogger

  constructor(
    private readonly chatDb: IrisPrismaClient,
    private readonly mainDb: MainPrismaClient,
    exporterSettings: ArchiveExporterSettings,
    private readonly s3: IrisS3,
    private readonly tmpDir: string,
  ) {
    this.exporter = new IrisExporter(chatDb, exporterSettings)
  }

  // ════════════════════════════════════════════
  //  归档主入口
  // ════════════════════════════════════════════

  /**
   * 执行归档流程。
   *
   * 指定 groupId 时只归档该群；不指定时自动发现所有已配置周期的群。
   */
  async archive(groupId?: bigint): Promise<ArchiveResult> {
    let cycles: Map<bigint, number>

    if (groupId != null) {
      // 单群：查该群显式 settings 记录，无记录则默认 180 天
      interface SettingsRow {
        value: string
      }
      const rows = await this.mainDb.$queryRaw<SettingsRow[]>`
        SELECT value FROM settings
        WHERE key = 'iris.archive_cycle_days'
          AND type = 'group'::settings_entry_type
          AND scope = ${groupId}
          AND value ~ '^\d+$'
      `
      const days = rows[0] ? parseInt(rows[0].value, 10) : 180
      if (days === 0) return { status: 'no_groups' }
      cycles = new Map([[groupId, days]])
    } else {
      cycles = await this._discoverGroupCycles()
    }

    if (cycles.size === 0) return { status: 'no_groups' }

    // 单群模式：保留所有结果（含 empty），多群模式：过滤 empty
    const isSingleGroup = groupId != null
    const results: GroupArchiveResult[] = []
    for (const [gId, cycleDays] of cycles) {
      try {
        const r = await this._archiveGroup(gId, cycleDays)
        if (isSingleGroup || r.status !== 'empty') {
          results.push(r)
        }
      } catch (err) {
        this._log.error({ groupId: gId.toString(), err }, '归档群失败')
        results.push({ groupId: gId.toString(), status: 'failed', error: String(err) })
      }
    }

    return { status: 'completed', results }
  }

  /**
   * 获取归档日志列表（分页）。
   */
  async getArchiveLogs(
    page = 1,
    pageSize = 20,
  ): Promise<{
    items: unknown[]
    total: number
    page: number
    pageSize: number
    pages: number
  }> {
    const skip = (page - 1) * pageSize
    const [rawItems, total] = await Promise.all([
      this.chatDb.archiveLog.findMany({
        orderBy: { periodStart: 'desc' },
        skip,
        take: pageSize,
      }),
      this.chatDb.archiveLog.count(),
    ])

    // BigInt → Number 转换（JSON.stringify 不支持 BigInt）
    const items = rawItems.map((r) => ({
      ...r,
      groupId: r.groupId != null ? r.groupId.toString() : null,
      totalRows: Number(r.totalRows),
      originalBytes: Number(r.originalBytes),
      compressedBytes: Number(r.compressedBytes),
    }))

    return {
      items,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    }
  }

  /**
   * 查询已完成的归档记录（按起始时间过滤）。
   */
  async listArchives(params: { periodStart: Date; limit?: number }): Promise<unknown[]> {
    const rows = await this.chatDb.archiveLog.findMany({
      where: {
        periodStart: { gte: params.periodStart },
        status: 'completed',
      },
      orderBy: { periodStart: 'desc' },
      take: params.limit ?? 50,
    })
    return rows.map((r) => ({
      ...r,
      groupId: r.groupId != null ? r.groupId.toString() : null,
      totalRows: Number(r.totalRows),
      originalBytes: Number(r.originalBytes),
      compressedBytes: Number(r.compressedBytes),
    }))
  }

  // ════════════════════════════════════════════
  //  内部方法
  // ════════════════════════════════════════════

  /**
   * 发现各群归档周期配置。
   *
   * 1. 查 settings 表中显式配置的群，value > 0 才纳入归档
   * 2. 查 master 账号所在的群，若无显式配置则默认 180 天
   */
  private async _discoverGroupCycles(): Promise<Map<bigint, number>> {
    const result = new Map<bigint, number>()

    // 第一步：查显式 settings 记录
    interface SettingsRow {
      scope: bigint
      value: string
    }
    const settingsRows = await this.mainDb.$queryRaw<SettingsRow[]>`
      SELECT scope, value FROM settings
      WHERE key = 'iris.archive_cycle_days'
        AND type = 'group'::settings_entry_type
        AND value ~ '^\d+$'
    `
    const explicitGroups = new Set<bigint>()
    for (const row of settingsRows) {
      explicitGroups.add(row.scope)
      const days = parseInt(row.value, 10)
      if (days > 0) result.set(row.scope, days)
    }

    // 第二步：查 master 账号所在群，补充默认 180 天
    interface MasterGroupRow {
      groupId: bigint
    }
    const masterGroups = await this.mainDb.$queryRaw<MasterGroupRow[]>`
      SELECT DISTINCT gm.group_id AS "groupId"
      FROM group_memberships gm
      JOIN accounts a ON a.qq = gm.user_id
      WHERE a.role = 'master' AND a.is_enabled = true AND gm.is_active = true
    `
    for (const row of masterGroups) {
      if (!explicitGroups.has(row.groupId)) {
        result.set(row.groupId, 180)
      }
    }

    return result
  }

  /** 单群归档主流程。 */
  private async _archiveGroup(groupId: bigint, cycleDays: number): Promise<GroupArchiveResult> {
    const groupIdStr = groupId.toString()

    // 关闭僵尸记录（上次运行意外中止的记录）
    await this.chatDb.archiveLog.updateMany({
      where: {
        groupId,
        status: { in: ['exporting', 'uploading', 'deleting'] },
      },
      data: {
        status: 'failed',
        errorMessage: '上次运行意外中止，已标记为失败',
      },
    })

    // periodEnd = now - cycleDays，截断到当天 00:00 UTC
    const now = new Date()
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    periodEnd.setUTCDate(periodEnd.getUTCDate() - cycleDays)

    // periodStart = 上次 completed 的 periodEnd，或 MIN(created_at)
    const prevLogs = await this.chatDb.archiveLog.findMany({
      where: { groupId, status: 'completed' },
      orderBy: { periodEnd: 'desc' },
      take: 1,
    })
    let periodStart: Date

    if (prevLogs.length > 0 && prevLogs[0]) {
      periodStart = prevLogs[0].periodEnd
    } else {
      interface MinRow {
        minCreatedAt: Date | null
      }
      const minRows = await this.chatDb.$queryRaw<MinRow[]>`
        SELECT MIN(created_at) AS "minCreatedAt"
        FROM chat_history
        WHERE group_id = ${groupId}
      `
      const minCreatedAt = minRows[0]?.minCreatedAt ?? null
      if (!minCreatedAt) {
        return { groupId: groupIdStr, status: 'empty' }
      }
      periodStart = minCreatedAt
    }

    if (periodStart >= periodEnd) {
      return { groupId: groupIdStr, status: 'empty' }
    }

    // seq = MAX(seq) + 1（所有状态，防止唯一约束冲突）
    const maxSeqResult = await this.chatDb.archiveLog.aggregate({
      where: { groupId },
      _max: { seq: true },
    })
    const seq = (maxSeqResult._max.seq ?? 0) + 1
    const seqStr = seq.toString().padStart(3, '0')
    const s3Key = `groups/${groupIdStr}/${seqStr}.parquet`
    const tmpPath = `${this.tmpDir}/iris_${groupIdStr}_${seqStr}_${Date.now().toString()}.parquet`

    const archiveLog = await this.chatDb.archiveLog.create({
      data: { groupId, seq, periodStart, periodEnd, s3Key, s3Sha256: '', status: 'pending' },
    })
    const archiveId = archiveLog.id

    try {
      await this._updateStatus(archiveId, 'exporting')

      const [totalRows, originalBytes, compressedBytes, sha256Hex, maxExportedId] =
        await this.exporter.exportGroup(groupId, periodStart, periodEnd, tmpPath)

      if (totalRows === 0) {
        await rm(tmpPath, { force: true })
        await this._updateStatus(archiveId, 'completed', undefined, new Date())
        return { groupId: groupIdStr, status: 'empty', rows: 0 }
      }

      await this._updateStatus(archiveId, 'uploading')

      await this.s3.uploadFile(tmpPath, s3Key, {
        groupId: groupIdStr,
        seq: String(seq),
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        totalRows: String(totalRows),
        sha256: sha256Hex,
      })

      const manifest = IrisS3.buildManifest(
        groupId,
        seq,
        periodStart,
        periodEnd,
        totalRows,
        originalBytes,
        compressedBytes,
        sha256Hex,
      )
      await this.s3.uploadManifest(manifest, s3Key.replace('.parquet', '.manifest.json'))

      await this.chatDb.archiveLog.update({
        where: { id: archiveId },
        data: {
          status: 'uploaded',
          totalRows: BigInt(totalRows),
          originalBytes: BigInt(originalBytes),
          compressedBytes: BigInt(compressedBytes),
          s3Sha256: sha256Hex,
        },
      })

      await rm(tmpPath, { force: true })

      // 分批 DELETE，每批 1000 行，批次间暂停 10ms 避免长事务阻塞写入
      await this._updateStatus(archiveId, 'deleting')
      let deleted = 1
      while (deleted > 0) {
        const result = await this.chatDb.$executeRawUnsafe(
          `DELETE FROM chat_history
           WHERE id IN (
             SELECT id FROM chat_history
             WHERE group_id = $1
               AND created_at < $2
               AND id <= $3
             LIMIT 1000
           )`,
          groupId,
          periodEnd,
          maxExportedId,
        )
        deleted = result
        if (deleted > 0) await setTimeout(10)
      }

      await this.chatDb.archiveLog.update({
        where: { id: archiveId },
        data: { status: 'completed', completedAt: new Date() },
      })

      this._log.info({ groupId: groupIdStr, seq, rows: totalRows, compressedBytes }, '归档完成')

      return {
        groupId: groupIdStr,
        status: 'completed',
        rows: totalRows,
        originalBytes,
        compressedBytes,
        s3Key,
      }
    } catch (err) {
      await this._updateStatus(archiveId, 'failed', String(err))
      throw err
    }
  }

  private async _updateStatus(
    id: string,
    status: ArchiveStatus,
    errorMessage?: string,
    completedAt?: Date,
  ): Promise<void> {
    await this.chatDb.archiveLog.update({
      where: { id },
      data: {
        status,
        ...(errorMessage != null ? { errorMessage } : {}),
        ...(completedAt != null ? { completedAt } : {}),
      },
    })
  }
}

/**
 * BullMQ processor 函数 —— 包装 IrisArchiveService.archive()。
 *
 * 使用方：在 Worker 进程中注册到 BullMQ Worker，传入 IrisArchiveService 实例后调用。
 */
export function archiveIrisProcessor(
  service: IrisArchiveService,
): (job: { data: ArchiveJobData }) => Promise<ArchiveResult> {
  return async (job) => {
    const groupId = job.data.groupId != null ? BigInt(job.data.groupId) : undefined
    return service.archive(groupId)
  }
}
