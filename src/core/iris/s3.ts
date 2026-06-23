/**
 * S3 上传服务 —— 封装 Parquet 文件和 manifest 的 S3 上传操作。
 */

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { Client as MinioClient } from 'minio'

/** Parquet 归档 manifest 结构。 */
export interface ArchiveManifest {
  version: number
  partition: string
  period: { start: string; end: string }
  stats: { totalRows: number }
  archive: {
    format: string
    compression: string
    originalSizeBytes: number
    compressedSizeBytes: number
    compressionRatio: number
    sha256: string
  }
  archivedAt: string
  archivedBy: string
}

/**
 * 负责 S3 文件上传操作，与归档编排逻辑解耦。
 *
 * 接收外部注入的 MinIO Client 实例（由 OSS Startup 统一管理）。
 */
export class IrisS3 {
  private readonly _log: PinoLogger = getLogger('IrisS3') as unknown as PinoLogger

  constructor(
    private readonly client: MinioClient,
    readonly bucket: string,
    readonly prefix: string,
  ) {}

  /**
   * 确保 bucket 存在，不存在时自动创建。
   */
  async ensureBucket(bucketName: string): Promise<void> {
    const exists = await this.client.bucketExists(bucketName)
    if (!exists) {
      await this.client.makeBucket(bucketName)
    }
  }

  /**
   * 上传 Buffer 到 S3 指定路径。
   */
  async upload(bucketName: string, key: string, data: Buffer): Promise<void> {
    await this.ensureBucket(bucketName)
    await this.client.putObject(bucketName, key, data, data.length)
  }

  /**
   * 上传本地文件到 S3（使用注入的 bucket）。
   */
  async uploadFile(
    filePath: string,
    s3Key: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.ensureBucket(this.bucket)
    await this.client.fPutObject(this.bucket, s3Key, filePath, metadata)
    this._log.info({ bucket: this.bucket, key: s3Key }, '文件已上传至 S3')
  }

  /**
   * 上传 manifest.json 到 S3（使用注入的 bucket）。
   */
  async uploadManifest(manifest: ArchiveManifest, s3Key: string): Promise<void> {
    const body = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8')
    await this.upload(this.bucket, s3Key, body)
  }

  /**
   * 构建归档 manifest 对象。
   */
  static buildManifest(
    partitionName: string,
    periodStart: Date,
    periodEnd: Date,
    totalRows: number,
    originalBytes: number,
    compressedBytes: number,
    sha256Hex: string,
  ): ArchiveManifest {
    const ratio =
      compressedBytes > 0 ? Math.round((originalBytes / compressedBytes) * 100) / 100 : 0

    return {
      version: 1,
      partition: partitionName,
      period: {
        start: periodStart.toISOString().slice(0, 10),
        end: periodEnd.toISOString().slice(0, 10),
      },
      stats: { totalRows },
      archive: {
        format: 'parquet',
        compression: 'zstd (built-in)',
        originalSizeBytes: originalBytes,
        compressedSizeBytes: compressedBytes,
        compressionRatio: ratio,
        sha256: sha256Hex,
      },
      archivedAt: new Date().toISOString(),
      archivedBy: 'aemeath-worker',
    }
  }
}
