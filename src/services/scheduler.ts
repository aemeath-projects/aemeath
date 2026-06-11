/** BullMQ 调度器 —— 注册所有定时任务到单队列。 */

import { getLogger } from '@logger'
import type { Queue } from 'bullmq'

import { Startup, Shutdown } from '@/core/lifecycle/registry.js'
import { JOB_NAME as ARCHIVE_JOB } from '@/tasks/chat-archive.js'
import { JOB_NAME as CHECKIN_JOB } from '@/tasks/daily-checkin.js'
import { JOB_NAME as LIKE_JOB } from '@/tasks/daily-like.js'
import { JOB_NAME as PARTITIONS_JOB } from '@/tasks/ensure-partitions.js'

const log = getLogger('scheduler')

const SCHEDULER_IDS = {
  DAILY_CHECKIN: 'schedule-daily-checkin',
  DAILY_LIKE: 'schedule-daily-like',
  CHAT_ARCHIVE: 'schedule-chat-archive',
  ENSURE_PARTITIONS: 'schedule-chat-partition-ensure',
} as const

export async function registerScheduledJobs(queue: Queue): Promise<void> {
  await Promise.all([
    queue.upsertJobScheduler(
      SCHEDULER_IDS.DAILY_CHECKIN,
      { pattern: '0 0 * * *', tz: 'Asia/Shanghai' },
      { name: CHECKIN_JOB },
    ),
    queue.upsertJobScheduler(
      SCHEDULER_IDS.DAILY_LIKE,
      { pattern: '0 0 * * *', tz: 'Asia/Shanghai' },
      { name: LIKE_JOB },
    ),
    queue.upsertJobScheduler(
      SCHEDULER_IDS.CHAT_ARCHIVE,
      { pattern: '0 3 1 * *', tz: 'Asia/Shanghai' },
      { name: ARCHIVE_JOB },
    ),
    queue.upsertJobScheduler(
      SCHEDULER_IDS.ENSURE_PARTITIONS,
      { pattern: '0 1 25 * *', tz: 'Asia/Shanghai' },
      { name: PARTITIONS_JOB },
    ),
  ])

  log.info({ jobs: Object.values(SCHEDULER_IDS) }, '定时任务注册完成')
}

Startup({
  name: 'scheduler',
  provides: ['scheduler'],
  requires: ['queue'],
})(async (deps: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const queue = deps.queue as Queue
  await registerScheduledJobs(queue)
  return { scheduler: { queue } }
})

// eslint-disable-next-line @typescript-eslint/no-empty-function
Shutdown({ name: 'scheduler' })(async (_services: Record<string, unknown>): Promise<void> => {})
