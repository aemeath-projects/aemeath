/**
 * Aemeath BullMQ Worker 进程入口 —— 单 Worker 实例按 job.name 路由。
 *
 * 启动方式：
 *   node dist/core/worker.js
 *   pnpm worker
 */

import { createLogger, setLogger, logger } from '@logger'
import { Worker } from 'bullmq'

import { CacheClient } from './cache/client.js'
import { loadConfig } from './config.js'
import { createMainDb, createChatDb } from './db/client.js'
import { createBullMQConnection, QUEUE_NAME } from './tasks/broker.js'
import { createRedis } from './utils/redis-factory.js'

import type { MinimalSettingSchema } from '@/core/settings/query.js'
import { JOB_NAME as ARCHIVE_JOB, chatArchiveProcessor } from '@/tasks/chat-archive.js'
import { JOB_NAME as CHECKIN_JOB, dailyCheckinProcessor } from '@/tasks/daily-checkin.js'
import { JOB_NAME as LIKE_JOB, dailyLikeProcessor } from '@/tasks/daily-like.js'
import { JOB_NAME as PARTITIONS_JOB, ensurePartitionsProcessor } from '@/tasks/ensure-partitions.js'

// ── 初始化 ──

const config = loadConfig()

// Worker 进程独立初始化 logger
setLogger(createLogger({ level: config.LOG_LEVEL, format: config.LOG_FORMAT }))
const log = logger.child({ name: 'worker' })

// ── 基础设施初始化 ──

const bullConn = createBullMQConnection(config.BULLMQ_REDIS_URL)
const db = createMainDb(config.DATABASE_URL)
const chatDb = createChatDb(config.CHAT_DATABASE_URL)
const cacheRedis = createRedis(config.CACHE_REDIS_URL)
const cache = new CacheClient(cacheRedis)

// ── Worker 专用 mini schemaMap（仅包含 Worker 查询的 key）──

const workerSchemaMap: ReadonlyMap<string, MinimalSettingSchema> = new Map([
  ['bot.enabled', { key: 'bot.enabled', type: 'boolean', default: true }],
  ['daily_checkin.enabled', { key: 'daily_checkin.enabled', type: 'boolean', default: false }],
])

log.info('Aemeath Worker 正在启动...')

// ── 单 Worker 实例，按 job.name 路由 ──

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case CHECKIN_JOB:
        return dailyCheckinProcessor(job, { db, cache, schemaMap: workerSchemaMap })
      case LIKE_JOB:
        return dailyLikeProcessor(job, { db })
      case ARCHIVE_JOB:
        return chatArchiveProcessor(job, { db, chatDb })
      case PARTITIONS_JOB:
        return ensurePartitionsProcessor(job, { chatDb })
      default:
        throw new Error(`未知的 job name: ${job.name}`)
    }
  },
  { connection: bullConn, concurrency: 3 },
)

// ── 事件处理 ──

worker.on('completed', (job) => {
  log.info(`任务完成: job=${job.id ?? ''} name=${job.name}`)
})

worker.on('failed', (job, err) => {
  log.error({ err }, `任务失败: job=${job?.id ?? ''} name=${job?.name ?? ''}`)
})

worker.on('error', (err) => {
  log.error({ err }, 'Worker 错误')
})

log.info(`Aemeath Worker 已启动，监听队列: ${QUEUE_NAME}`)

// ── 优雅关闭 ──

async function shutdown(): Promise<void> {
  log.info('收到停止信号，正在优雅关闭...')
  await worker.close()
  await db.$disconnect()
  await chatDb.$disconnect()
  cacheRedis.disconnect()
  log.info('Aemeath Worker 已停止')
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown()
})

process.on('SIGINT', () => {
  void shutdown()
})
