/**
 * 聊天记录归档服务与 BullMQ 任务 —— 编排冷数据归档流程（发现分区 → 导出 → 上传 S3 → 清理）。
 */

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

import type { ArchiveStatus } from '#prisma/iris'

import { IrisExporter, PARTITION_NAME_RE } from './exporter.js'
import type { ArchiveExporterSettings } from './exporter.js'
import { IrisS3 } from './s3.js'

import type { IrisPrismaClient } from '@/core/db/index.js'

/** 归档单个分区的执行结果。 */
export interface PartitionArchiveResult {
  partition: string
  status: 'completed' | 'empty' | 'failed'
  rows?: number
  originalBytes?: number
  compressedBytes?: number
  s3Key?: string
  error?: string
}

/** 归档入口结果。 */
export interface ArchiveResult {
  status: 'completed' | 'no_partitions'
  message?: string
  results?: PartitionArchiveResult[]
}

/** BullMQ job data 结构。 */
export interface ArchiveJobData {
  partitionName?: string
}

/**
 * 聊天记录归档编排服务 —— 协调分区发现、导出、上传和状态更新。
 */
export class IrisArchiveService {
  private readonly exporter: IrisExporter
  private readonly _log: PinoLogger = getLogger('iris:archive') as unknown as PinoLogger

  constructor(
    private readonly chatDb: IrisPrismaClient,
    private readonly exporterSettings: ArchiveExporterSettings,
    private readonly s3: IrisS3,
    private readonly tmpDir: string,
  ) {
    this.exporter = new IrisExporter(chatDb, exporterSettings)
  }

  // ════════════════════════════════════════════
  //  分区管理
  // ════════════════════════════════════════════

  /**
   * 确保 iris 数据库的基础 schema 与工具函数存在。
   *
   * 幂等，可重复调用。新库首次启动时完成 chat schema 和
   * create_monthly_partition 函数的创建；已存在则跳过。
   */
  async ensureSchema(): Promise<void> {
    await this.chatDb.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS chat`)

    // 若 chat_history 是普通表（Prisma 迁移所建），重建为 RANGE 分区父表
    // relkind: 'r'=普通表  'p'=分区父表
    await this.chatDb.$executeRawUnsafe(`
      DO $do$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'chat_history' AND n.nspname = 'public' AND c.relkind = 'r'
        ) THEN
          DROP TABLE public.chat_history CASCADE;

          CREATE SEQUENCE IF NOT EXISTS public.chat_history_id_seq AS BIGINT;

          CREATE TABLE public.chat_history (
            id           BIGINT       NOT NULL DEFAULT nextval('public.chat_history_id_seq'),
            created_at   TIMESTAMPTZ  NOT NULL,
            message_id   BIGINT       NOT NULL,
            message_type SMALLINT     NOT NULL,
            group_id     BIGINT,
            user_id      BIGINT       NOT NULL,
            raw_message  TEXT         NOT NULL DEFAULT '',
            segments     JSONB        NOT NULL DEFAULT '[]',
            sender_nickname VARCHAR(64) NOT NULL DEFAULT '',
            sender_card  VARCHAR(64),
            sender_role  VARCHAR(10),
            stored_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chat_history_pkey PRIMARY KEY (id, created_at)
          ) PARTITION BY RANGE (created_at);

          ALTER SEQUENCE public.chat_history_id_seq OWNED BY public.chat_history.id;

          CREATE INDEX ix_chat_group_time  ON public.chat_history (group_id,     created_at DESC);
          CREATE INDEX ix_chat_user_time   ON public.chat_history (user_id,      created_at DESC);
          CREATE INDEX ix_chat_message_id  ON public.chat_history (message_id,   created_at DESC);
          CREATE INDEX ix_chat_type_time   ON public.chat_history (message_type, created_at DESC);
        END IF;
      END
      $do$
    `)

    await this.chatDb.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION chat.create_monthly_partition(target_date DATE)
      RETURNS void
      LANGUAGE plpgsql AS $fn$
      DECLARE
          v_name  TEXT;
          v_start DATE;
          v_end   DATE;
      BEGIN
          v_start := DATE_TRUNC('month', target_date)::DATE;
          v_end   := (DATE_TRUNC('month', target_date) + INTERVAL '1 month')::DATE;
          v_name  := 'chat_history_' || TO_CHAR(v_start, 'YYYY_MM');

          IF NOT EXISTS (
              SELECT 1
              FROM   pg_class     c
              JOIN   pg_namespace n ON n.oid = c.relnamespace
              WHERE  c.relname = v_name AND n.nspname = 'chat'
          ) THEN
              EXECUTE FORMAT(
                  'CREATE TABLE chat.%I PARTITION OF public.chat_history
                   FOR VALUES FROM (%L) TO (%L)',
                  v_name, v_start, v_end
              );
          END IF;
      END;
      $fn$
    `)
  }

  /**
   * 确保当月和下月的分区存在。
   */
  async ensurePartitions(): Promise<{ status: string; message: string }> {
    await this.chatDb.$executeRaw`SELECT chat.create_monthly_partition(CURRENT_DATE)`
    await this.chatDb
      .$executeRaw`SELECT chat.create_monthly_partition((CURRENT_DATE + INTERVAL '1 month')::DATE)`
    return { status: 'ok', message: '分区已就绪' }
  }

  // ════════════════════════════════════════════
  //  归档主流程
  // ════════════════════════════════════════════

  /**
   * 执行归档流程。
   *
   * 如果未指定 partitionName，则自动发现超过保留月数的分区。
   */
  async archive(partitionName?: string): Promise<ArchiveResult> {
    let partitions: string[]

    if (partitionName != null) {
      if (!PARTITION_NAME_RE.test(partitionName)) {
        throw new Error(`非法分区名: ${partitionName}，格式须为 chat_history_YYYY_MM`)
      }
      partitions = [partitionName]
    } else {
      partitions = await this._discoverArchivablePartitions()
    }

    if (partitions.length === 0) {
      return { status: 'no_partitions', message: '没有需要归档的分区' }
    }

    const results: PartitionArchiveResult[] = []
    for (const part of partitions) {
      try {
        const result = await this._archivePartition(part)
        results.push(result)
      } catch (err) {
        this._log.error({ partition: part, err }, '归档分区失败')
        results.push({
          partition: part,
          status: 'failed',
          error: String(err),
        })
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
    // BigInt → Number 转换
    return rows.map((r) => ({
      ...r,
      totalRows: Number(r.totalRows),
      originalBytes: Number(r.originalBytes),
      compressedBytes: Number(r.compressedBytes),
    }))
  }

  // ════════════════════════════════════════════
  //  内部方法
  // ════════════════════════════════════════════

  /**
   * 获取当前月分区的消息行数（供 IrisCounter 启动时同步计数使用）。
   */
  async getCurrentPartitionRowCount(): Promise<number> {
    const now = new Date()
    const year = now.getFullYear().toString().padStart(4, '0')
    const month = (now.getMonth() + 1).toString().padStart(2, '0')
    const partitionName = `chat_history_${year}_${month}`

    interface CountRow {
      count: bigint
    }
    const rows = await this.chatDb.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS count FROM chat."${partitionName}"`,
    )
    return Number(rows[0]?.count ?? 0)
  }

  private async _discoverArchivablePartitions(): Promise<string[]> {
    const retentionMs = this.exporterSettings.retentionMonths * 30 * 24 * 60 * 60 * 1000
    const cutoff = new Date(Date.now() - retentionMs)
    const year = cutoff.getFullYear().toString().padStart(4, '0')
    const month = (cutoff.getMonth() + 1).toString().padStart(2, '0')
    const cutoffSuffix = `${year}_${month}`

    interface PartitionRow {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      partition_name: string
    }
    const rows = await this.chatDb.$queryRaw<PartitionRow[]>`
      SELECT c.relname AS partition_name
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      JOIN pg_namespace n ON n.oid = p.relnamespace
      WHERE n.nspname = 'chat'
        AND p.relname = 'chat_history'
        AND replace(c.relname, 'chat_history_', '') < ${cutoffSuffix}
      ORDER BY c.relname
    `

    const archivable = rows.map((r) => r.partition_name)
    if (archivable.length === 0) return []

    const existingLogs = await this.chatDb.archiveLog.findMany({
      where: {
        partitionName: { in: archivable },
        status: 'completed',
      },
      select: { partitionName: true },
    })
    const alreadyArchived = new Set(existingLogs.map((l) => l.partitionName))
    return archivable.filter((p) => !alreadyArchived.has(p))
  }

  private async _archivePartition(partitionName: string): Promise<PartitionArchiveResult> {
    if (!PARTITION_NAME_RE.test(partitionName)) {
      throw new Error(`非法分区名: ${partitionName}，格式须为 chat_history_YYYY_MM`)
    }

    const suffix = partitionName.replace('chat_history_', '')
    const parts = suffix.split('_')
    const year = Number(parts[0])
    const month = Number(parts[1])

    const periodStart = new Date(year, month - 1, 1)
    const periodEnd = month === 12 ? new Date(year + 1, 0, 1) : new Date(year, month, 1)

    const archiveLog = await this.chatDb.archiveLog.create({
      data: {
        partitionName,
        periodStart,
        periodEnd,
        s3Bucket: this.s3.bucket,
        s3Key: '',
        s3Sha256: '',
        status: 'pending',
      },
    })

    const archiveId = archiveLog.id

    try {
      await this._updateArchiveStatus(archiveId, 'exporting')

      const tmpPath = `${this.tmpDir}/${partitionName}_${Date.now().toString()}.parquet`

      const [totalRows, originalBytes, compressedBytes, sha256Hex] =
        await this.exporter.exportPartition(partitionName, tmpPath)

      if (totalRows === 0) {
        await this._updateArchiveStatus(archiveId, 'completed', '分区为空，跳过')
        return { partition: partitionName, status: 'empty', rows: 0 }
      }

      await this._updateArchiveStatus(archiveId, 'uploading')

      const yearPadded = year.toString().padStart(4, '0')
      const monthPadded = month.toString().padStart(2, '0')
      const s3Key = `${yearPadded}/${monthPadded}/${partitionName}.parquet`

      await this.s3.uploadFile(tmpPath, s3Key, {
        partition: partitionName,
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        totalRows: String(totalRows),
        sha256: sha256Hex,
      })

      const manifest = IrisS3.buildManifest(
        partitionName,
        periodStart,
        periodEnd,
        totalRows,
        originalBytes,
        compressedBytes,
        sha256Hex,
      )
      const manifestKey = s3Key.replace('.parquet', '.manifest.json')
      await this.s3.uploadManifest(manifest, manifestKey)

      await this._updateArchiveStatus(archiveId, 'uploaded')

      await this.chatDb.archiveLog.update({
        where: { id: archiveId },
        data: {
          totalRows: BigInt(totalRows),
          originalBytes: BigInt(originalBytes),
          compressedBytes: BigInt(compressedBytes),
          s3Key,
          s3Sha256: sha256Hex,
        },
      })

      // 分离并删除分区表（分区名已通过正则白名单验证）
      await this.chatDb.$executeRawUnsafe(
        `ALTER TABLE chat.chat_history DETACH PARTITION chat."${partitionName}"`,
      )
      await this.chatDb.$executeRawUnsafe(`DROP TABLE chat."${partitionName}"`)

      await this._updateArchiveStatus(archiveId, 'partition_dropped')

      await this.chatDb.archiveLog.update({
        where: { id: archiveId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      })

      this._log.info({ partition: partitionName, rows: totalRows, compressedBytes }, '归档完成')

      return {
        partition: partitionName,
        status: 'completed',
        rows: totalRows,
        originalBytes,
        compressedBytes,
        s3Key,
      }
    } catch (err) {
      await this._updateArchiveStatus(archiveId, 'failed', String(err))
      throw err
    }
  }

  private async _updateArchiveStatus(
    archiveId: string,
    status: ArchiveStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.chatDb.archiveLog.update({
      where: { id: archiveId },
      data: {
        status,
        ...(errorMessage != null ? { errorMessage } : {}),
        ...(status === 'completed' ? { completedAt: new Date() } : {}),
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
    return service.archive(job.data.partitionName)
  }
}
