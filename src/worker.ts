/**
 * Texas BullMQ Worker 进程入口 —— 消费队列任务，通过 RPC 调用主进程业务服务。
 *
 * 启动方式：
 *   node dist/worker.js
 *   pnpm worker
 */

import { Worker } from 'bullmq'

import { loadConfig } from './core/config.js'
import { createBullMQConnection, QUEUE_NAMES } from './core/tasks/broker.js'
import { dailyCheckinProcessor } from './tasks/daily-checkin.js'
import { dailyLikeProcessor } from './tasks/daily-like.js'

// ── 初始化 ──

const config = loadConfig()
const connection = createBullMQConnection(config.BULLMQ_REDIS_URL)

console.info('[worker] Texas Worker 正在启动...')

// ── 创建 Worker 实例 ──

const workers = [
  new Worker(QUEUE_NAMES.DAILY_CHECKIN, dailyCheckinProcessor, {
    connection,
    concurrency: 1,
  }),
  new Worker(QUEUE_NAMES.DAILY_LIKE, dailyLikeProcessor, {
    connection,
    concurrency: 1,
  }),
]

// ── 错误处理 ──

for (const worker of workers) {
  worker.on('completed', (job) => {
    console.info(`[worker] 任务完成: queue=${worker.name} job=${job.id ?? ''}`)
  })

  worker.on('failed', (job, err) => {
    console.error(
      `[worker] 任务失败: queue=${worker.name} job=${job?.id ?? ''} error=${String(err)}`,
    )
  })

  worker.on('error', (err) => {
    console.error(`[worker] Worker 错误: queue=${worker.name}`, err)
  })
}

console.info(`[worker] Texas Worker 已启动，监听队列: ${workers.map((w) => w.name).join(', ')}`)

// ── 优雅关闭 ──

async function shutdown(): Promise<void> {
  console.info('[worker] 收到停止信号，正在优雅关闭...')
  await Promise.all(workers.map((w) => w.close()))
  console.info('[worker] Texas Worker 已停止')
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown()
})

process.on('SIGINT', () => {
  void shutdown()
})
