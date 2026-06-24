/**
 * Iris 生命周期注册 —— 初始化 IrisService 与 IrisArchiveService。
 */

import { Service, Inject, Provide, Startup, Shutdown } from '@aemeath-projects/exostrider/lifecycle'
import type { Queue } from 'bullmq'
import type { Client } from 'minio'

import { IrisArchiveService } from './archive.js'
import { IrisCounter } from './counter.js'
import type { MediaStorageService } from './media.js'
import { IrisS3 } from './s3.js'
import { IrisSearchService } from './search.js'
import { IrisService } from './service.js'

import { loadConfig } from '@/core/config.js'
import type { IrisPrismaClient } from '@/core/db/index.js'
import type { OssBundle, OssBuckets } from '@/core/oss/index.js'

/* 生命周期注册 */

@Service({ name: 'iris_bootstrap' })
export class IrisBootstrap {
  /** 注入聊天数据库 */
  @Inject('iris_db')
  chatDb!: IrisPrismaClient

  /** 注入 OSS 客户端与 bucket 配置 */
  @Inject('oss')
  oss!: OssBundle

  /** 注入媒体存储服务 */
  @Inject('media_storage')
  mediaStorage!: MediaStorageService

  /** 注入 BullMQ 任务队列 */
  @Inject('queue')
  queue!: Queue

  /** 对外暴露聊天历史服务 */
  @Provide('iris')
  irisService!: IrisService

  /** 对外暴露归档服务 */
  @Provide('iris_archive')
  irisArchiveService!: IrisArchiveService

  /** 对外暴露消息计数器 */
  @Provide('iris_counter')
  irisCounter!: IrisCounter

  /** 对外暴露归档消息搜索服务 */
  @Provide('iris_search')
  irisSearch!: IrisSearchService

  @Startup
  async start(): Promise<void> {
    const config = loadConfig()
    const { client, buckets } = this.oss as { client: Client; buckets: OssBuckets }

    this.irisService = new IrisService(this.chatDb, this.mediaStorage)

    const exporterSettings = {
      retentionMonths: 12,
      batchSize: 5000,
      compression: 'zstd' as const,
    }
    const irisS3 = new IrisS3(client, buckets.iris)
    this.irisArchiveService = new IrisArchiveService(
      this.chatDb,
      exporterSettings,
      irisS3,
      config.TMPDIR,
    )

    await this.irisArchiveService.ensureSchema()
    await this.irisArchiveService.ensurePartitions()
    this.irisCounter = new IrisCounter(100_000, this.queue, this.irisArchiveService)
    await this.irisCounter.syncFromDb()

    this.irisSearch = new IrisSearchService(this.chatDb)
  }

  @Shutdown
  async stop(): Promise<void> {
    await this.irisService.close()
  }
}
