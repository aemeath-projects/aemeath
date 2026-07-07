/** 每日点赞 BullMQ 处理器 —— Worker 内查询 DB，返回 BotApiCall[]。 */

import type { Job } from 'bullmq'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import type { BotActionJobResult, TaskDefinition } from '@/core/tasks/index.js'

export const JOB_NAME = 'daily-like' as const

const DEFAULT_LIKE_TIMES = 10
/** 单次最多处理的任务数，防止全量加载内存压力过大。 */
const TASK_BATCH_SIZE = 1000

export interface LikeWorkerDeps {
  db: AemeathPrismaClient
}

export async function dailyLikeProcessor(
  _job: Job,
  deps: LikeWorkerDeps,
): Promise<BotActionJobResult> {
  const tasks = await deps.db.likeTask.findMany({ select: { qq: true }, take: TASK_BATCH_SIZE })

  const calls = tasks.map((t) => ({
    method: 'sendLike',
    args: [Number(t.qq), DEFAULT_LIKE_TIMES],
  }))

  return { type: 'bot-action', calls }
}

export const taskDefinition: TaskDefinition = {
  jobName: 'daily_like',
  requires: ['db', 'cache'],
  concurrency: 1,
  schedule: { cron: '0 0 * * *', tz: 'Asia/Shanghai' },
  processor: async (job: Job, deps: Record<string, unknown>): Promise<BotActionJobResult> => {
    return dailyLikeProcessor(job, deps as unknown as LikeWorkerDeps)
  },
}
