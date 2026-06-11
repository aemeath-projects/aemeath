/** 每日点赞 BullMQ 处理器 —— Worker 内查询 DB，返回 BotApiCall[]。 */

import type { Job } from 'bullmq'

import type { MainPrismaClient } from '@/core/db/client.js'
import type { BotActionJobResult } from '@/core/tasks/models.js'

export const JOB_NAME = 'daily-like' as const

const DEFAULT_LIKE_TIMES = 10

export interface LikeWorkerDeps {
  db: MainPrismaClient
}

export async function dailyLikeProcessor(
  _job: Job,
  deps: LikeWorkerDeps,
): Promise<BotActionJobResult> {
  const tasks = await deps.db.likeTask.findMany({ select: { qq: true } })

  const calls = tasks.map((t) => ({
    method: 'sendLike',
    args: [Number(t.qq), DEFAULT_LIKE_TIMES],
  }))

  return { type: 'bot-action', calls }
}
