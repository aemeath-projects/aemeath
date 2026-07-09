/**
 * Parquet 导出服务 —— 将分区数据批量导出为 Parquet 文件（parquet-wasm + apache-arrow）。
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { tableFromArrays, tableToIPC } from 'apache-arrow'
import {
  Compression,
  Table,
  WriterPropertiesBuilder,
  initSync,
  writeParquet,
} from 'parquet-wasm/esm'

import type { IrisPrismaClient } from '@/core/db/index.js'

// WASM 初始化（模块加载时执行一次）
const _require = createRequire(import.meta.url)
initSync({ module: readFileSync(_require.resolve('parquet-wasm/esm/parquet_wasm_bg.wasm')) })

/** 归档导出配置。 */
export interface ArchiveExporterSettings {
  /** 保留月数（超过则可归档），默认 12。 */
  retentionMonths: number
  /** 批量读取行数，默认 5000。 */
  batchSize: number
  /** Parquet 压缩算法，默认 zstd。 */
  compression: 'zstd' | 'gzip' | 'none'
}

/** 数据库原始行类型。 */
interface RawRow {
  id: bigint

  created_at: Date

  message_id: bigint

  message_type: number

  group_id: bigint | null

  user_id: bigint

  raw_message: string
  segments: unknown

  sender_nickname: string

  sender_card: string | null

  sender_role: string | null

  stored_at: Date
}

/**
 * Parquet 导出服务 —— 游标分批读取分区数据，构建 Arrow 列式表，写入 Parquet 文件。
 */
export class IrisExporter {
  constructor(
    private readonly chatDb: IrisPrismaClient,
    private readonly settings: ArchiveExporterSettings,
  ) {}

  /**
   * 按群 + 时间段导出聊天记录为 Parquet 文件。
   *
   * @param groupId - 群号
   * @param periodStart - 时间段起始（含）
   * @param periodEnd - 时间段结束（不含）
   * @param outputPath - 输出文件路径
   * @returns [totalRows, originalBytes（近似）, compressedBytes, sha256Hex, maxExportedId]
   */
  async exportGroup(
    groupId: string,
    periodStart: Date,
    periodEnd: Date,
    outputPath: string,
  ): Promise<[number, number, number, string, bigint]> {
    // 1. 游标分批读取所有行
    const allRows: RawRow[] = []
    let cursor: bigint | undefined
    let hasMore = true

    while (hasMore) {
      const rows: RawRow[] =
        cursor !== undefined
          ? await this.chatDb.$queryRawUnsafe<RawRow[]>(
              `SELECT id, created_at, message_id, message_type, group_id, user_id,
                      raw_message, segments, sender_nickname, sender_card, sender_role, stored_at
               FROM chat_history
               WHERE group_id = $1 AND created_at >= $2 AND created_at < $3
                 AND id > $4
               ORDER BY id ASC
               LIMIT $5`,
              groupId,
              periodStart,
              periodEnd,
              cursor,
              this.settings.batchSize,
            )
          : await this.chatDb.$queryRawUnsafe<RawRow[]>(
              `SELECT id, created_at, message_id, message_type, group_id, user_id,
                      raw_message, segments, sender_nickname, sender_card, sender_role, stored_at
               FROM chat_history
               WHERE group_id = $1 AND created_at >= $2 AND created_at < $3
               ORDER BY id ASC
               LIMIT $4`,
              groupId,
              periodStart,
              periodEnd,
              this.settings.batchSize,
            )

      if (rows.length === 0) break
      allRows.push(...rows)

      const lastRow = rows[rows.length - 1]
      if (lastRow !== undefined) cursor = lastRow.id
      hasMore = rows.length >= this.settings.batchSize
    }

    const totalRows = allRows.length
    const lastItem = allRows[allRows.length - 1]
    const maxExportedId = lastItem !== undefined ? lastItem.id : 0n

    // 2. 无数据时直接返回
    if (totalRows === 0) {
      await writeFile(outputPath, Buffer.alloc(0))
      return [0, 0, 0, '', maxExportedId]
    }

    // 3. 构建 Apache Arrow 列式数组
    // 使用 BigInt64Array / Int32Array 等强类型列，保证 Parquet 类型映射准确
    const colId = new BigInt64Array(totalRows)
    const colCreatedAt = new BigInt64Array(totalRows) // Unix 毫秒时间戳
    const colMessageId = new BigInt64Array(totalRows)
    const colMessageType = new Int32Array(totalRows)
    const colGroupId: (bigint | null)[] = []
    const colUserId = new BigInt64Array(totalRows)
    const colRawMessage: string[] = []
    const colSegments: string[] = []
    const colSenderNickname: string[] = []
    const colSenderCard: (string | null)[] = []
    const colSenderRole: (string | null)[] = []
    const colStoredAt = new BigInt64Array(totalRows) // Unix 毫秒时间戳

    for (const [i, row] of allRows.entries()) {
      colId[i] = row.id
      colCreatedAt[i] = BigInt(row.created_at.getTime())
      colMessageId[i] = row.message_id
      colMessageType[i] = row.message_type
      colGroupId.push(row.group_id)
      colUserId[i] = row.user_id
      colRawMessage.push(row.raw_message)
      colSegments.push(JSON.stringify(row.segments))
      colSenderNickname.push(row.sender_nickname)
      colSenderCard.push(row.sender_card)
      colSenderRole.push(row.sender_role)
      colStoredAt[i] = BigInt(row.stored_at.getTime())
    }

    const arrowTable = tableFromArrays({
      id: colId,
      created_at: colCreatedAt,
      message_id: colMessageId,
      message_type: colMessageType,
      group_id: colGroupId,
      user_id: colUserId,
      raw_message: colRawMessage,
      segments: colSegments,
      sender_nickname: colSenderNickname,
      sender_card: colSenderCard,
      sender_role: colSenderRole,
      stored_at: colStoredAt,
    })

    // 4. Arrow → IPC Stream → WASM Table → Parquet bytes
    const ipcBytes = tableToIPC(arrowTable, 'stream')
    const wasmTable = Table.fromIPCStream(ipcBytes)

    const compression = _resolveCompression(this.settings.compression)
    const writerProps = new WriterPropertiesBuilder().setCompression(compression).build()
    const parquetBytes = writeParquet(wasmTable, writerProps)

    // 5. 写入文件并计算摘要
    await writeFile(outputPath, parquetBytes)

    const fileStats = await stat(outputPath)
    const compressedBytes = fileStats.size
    const sha256Hex = await _computeFileSha256(outputPath)

    // originalBytes 近似值：行数 × 平均行字节估算
    const originalBytes = totalRows * 512

    return [totalRows, originalBytes, compressedBytes, sha256Hex, maxExportedId]
  }
}

/** 压缩算法名称映射到 parquet-wasm Compression 枚举。 */
function _resolveCompression(compression: 'zstd' | 'gzip' | 'none'): Compression {
  switch (compression) {
    case 'zstd':
      return Compression.ZSTD
    case 'gzip':
      return Compression.GZIP
    case 'none':
      return Compression.UNCOMPRESSED
  }
}

/** 流式计算文件的 SHA256 摘要。 */
async function _computeFileSha256(filePath: string): Promise<string> {
  const { createReadStream } = await import('node:fs')
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => {
      hash.update(chunk)
    })
    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })
    stream.on('error', reject)
  })
}
