/**
 * 任务队列 API 端点 —— 查询定时任务与消息队列状态，SSE 实时推送。
 */

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import {
  QueueStreamQuerySchema,
  ScheduledTasksDataSchema,
  ActiveTasksDataSchema,
  ReservedTasksDataSchema,
  WorkersDataSchema,
  QueueLengthDataSchema,
  PendingTasksDataSchema,
} from '@/apis/schemas/index.js'
import { fail, ok, FailResponse, OkResponse } from '@/core/schemas/index.js'

const log: PinoLogger = getLogger('queue') as unknown as PinoLogger

const TASK_DISPLAY_NAMES: Record<string, string> = {
  archive_chat_history: '聊天记录归档',
  ensure_chat_partitions: '分区预创建',
  trigger_daily_checkin: '每日打卡',
  trigger_daily_like: '每日点赞',
  _send_chat_archive: '聊天记录归档',
  _send_ensure_partitions: '分区预创建',
  _send_daily_checkin: '每日打卡',
  _send_daily_like: '每日点赞',
}

function displayTaskName(name: string): string {
  const short = name.includes('.') ? (name.split('.').at(-1) ?? name) : name
  return TASK_DISPLAY_NAMES[short] ?? TASK_DISPLAY_NAMES[name] ?? name
}

/* BullMQ 队列操作接口（内联类型，避免引入 bullmq 运行时） */

interface BullJob {
  id: string | undefined
  name: string
  data: unknown
  processedOn?: number
}

interface BullWorker {
  id: string
  addr?: string
  name?: string
}

interface BullJobScheduler {
  name: string
  pattern?: string
  tz?: string
}

interface BullQueue {
  name: string
  getActive(): Promise<BullJob[]>
  getWaiting(): Promise<BullJob[]>
  getWorkers(): Promise<BullWorker[]>
  getJobSchedulers(): Promise<BullJobScheduler[]>
}

/* 队列数据 → 前端展示结构的纯映射函数 */

/** 将 BullMQ Job Scheduler 映射为前端展示用的定时任务条目。 */
export function mapJobSchedulerToTask(s: BullJobScheduler): Record<string, unknown> {
  return {
    name: displayTaskName(s.name),
    task: s.name,
    schedule: s.pattern ?? '',
    scheduleRaw: null,
    args: null,
    kwargs: null,
    options: { expires: null, queue: 'aemeath-tasks' },
    enabled: true,
  }
}

/** 将 BullMQ 活跃任务映射为前端展示条目。 */
export function mapActiveJob(queueName: string, job: BullJob): Record<string, unknown> {
  return {
    worker: queueName,
    id: job.id ?? '',
    name: displayTaskName(job.name),
    args: JSON.stringify(job.data),
    kwargs: '{}',
    started: job.processedOn != null ? Math.floor(job.processedOn / 1000) : null,
    acknowledged: true,
  }
}

/** 将 BullMQ 待处理任务映射为前端展示条目。 */
export function mapPendingJob(job: BullJob): Record<string, unknown> {
  return {
    id: job.id ?? '',
    name: displayTaskName(job.name),
    args: JSON.stringify(job.data),
    kwargs: null,
  }
}

/** 将 BullMQ Worker 信息映射为前端展示条目，调用方负责按地址去重。 */
export function mapWorker(queueName: string, w: BullWorker): Record<string, unknown> {
  const parts = (w.addr ?? '').split(':')
  const pid = parts[2] ? parseInt(parts[2], 10) : null
  return {
    name: w.name ?? w.addr ?? w.id,
    concurrency: null,
    broker: queueName,
    prefetchCount: null,
    pid: pid !== null && Number.isFinite(pid) ? pid : null,
    uptime: null,
  }
}

/* 聚合所有队列状态的辅助函数 */

interface QueueStateResult {
  scheduledTasks: unknown[]
  activeTasks: unknown[]
  pendingTasks: unknown[]
  workers: unknown[]
  totalLength: number
}

async function collectQueueState(app: FastifyInstance): Promise<QueueStateResult> {
  const queue = app.services.getOptional('queue') as BullQueue | undefined

  const scheduledTasks: unknown[] = []
  const activeTasks: unknown[] = []
  const pendingTasks: unknown[] = []
  const workers: unknown[] = []
  let totalLength = 0

  if (queue !== undefined) {
    try {
      const [schedulers, active, waiting, queueWorkers] = await Promise.all([
        queue.getJobSchedulers(),
        queue.getActive(),
        queue.getWaiting(),
        queue.getWorkers(),
      ])

      scheduledTasks.push(...schedulers.map(mapJobSchedulerToTask))
      activeTasks.push(...active.map((job) => mapActiveJob(queue.name, job)))
      pendingTasks.push(...waiting.map(mapPendingJob))

      const seen = new Set<string>()
      for (const w of queueWorkers) {
        const key = w.addr ?? w.id
        if (seen.has(key)) continue
        seen.add(key)
        workers.push(mapWorker(queue.name, w))
      }

      totalLength = active.length + waiting.length
    } catch (err) {
      log.warn({ err }, '队列状态收集失败')
    }
  }

  return { scheduledTasks, activeTasks, pendingTasks, workers, totalLength }
}

/**
 * 任务队列路由插件。
 */
const queueRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/queue/scheduled-tasks — 获取已注册的定时任务列表。 */
  app.get(
    '/api/queue/scheduled-tasks',
    {
      schema: {
        response: {
          200: OkResponse(ScheduledTasksDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const queue = app.services.getOptional('queue') as BullQueue | undefined
      if (queue === undefined) {
        await reply.send(ok([]))
        return
      }

      try {
        const schedulers = await queue.getJobSchedulers()
        await reply.send(ok(schedulers.map(mapJobSchedulerToTask)))
      } catch (err) {
        log.warn({ err }, '获取定时任务失败')
        await reply.send(ok([]))
      }
    },
  )

  /** GET /api/queue/active-tasks — 获取当前正在执行的任务。 */
  app.get(
    '/api/queue/active-tasks',
    {
      schema: {
        response: {
          200: OkResponse(ActiveTasksDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const queue = app.services.getOptional('queue') as BullQueue | undefined
      if (queue === undefined) {
        await reply.send(ok([]))
        return
      }

      try {
        const jobs = await queue.getActive()
        await reply.send(ok(jobs.map((job) => mapActiveJob(queue.name, job))))
      } catch (err) {
        log.warn({ err }, '获取队列活跃任务失败')
        await reply.send(ok([]))
      }
    },
  )

  /** GET /api/queue/reserved-tasks — 获取已预取但未执行的任务。 */
  app.get(
    '/api/queue/reserved-tasks',
    {
      schema: {
        response: {
          200: OkResponse(ReservedTasksDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      await reply.send(ok([]))
    },
  )

  /** GET /api/queue/workers — 获取在线 Worker 节点信息。 */
  app.get(
    '/api/queue/workers',
    {
      schema: {
        response: {
          200: OkResponse(WorkersDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const queue = app.services.getOptional('queue') as BullQueue | undefined
      if (queue === undefined) {
        await reply.send(ok([]))
        return
      }

      try {
        const queueWorkers = await queue.getWorkers()
        const seen = new Set<string>()
        const results: unknown[] = []
        for (const w of queueWorkers) {
          const key = w.addr ?? w.id
          if (seen.has(key)) continue
          seen.add(key)
          results.push(mapWorker(queue.name, w))
        }
        await reply.send(ok(results))
      } catch (err) {
        log.warn({ err }, '获取队列 Worker 信息失败')
        await reply.send(ok([]))
      }
    },
  )

  /** GET /api/queue/queue-length — 获取队列中的消息数量。 */
  app.get(
    '/api/queue/queue-length',
    {
      schema: {
        response: {
          200: OkResponse(QueueLengthDataSchema),
          500: FailResponse(),
          503: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const queue = app.services.getOptional('queue') as BullQueue | undefined
      if (queue === undefined) {
        await reply.status(503).send(fail('队列未就绪', { queue: 'bullmq', length: null }))
        return
      }

      try {
        const [active, waiting] = await Promise.all([queue.getActive(), queue.getWaiting()])
        await reply.send(ok({ queue: 'bullmq', length: active.length + waiting.length }))
      } catch (err) {
        log.warn({ err }, '获取队列长度失败')
        await reply.status(500).send(fail('无法获取队列长度', { queue: 'bullmq', length: null }))
      }
    },
  )

  /** GET /api/queue/pending-tasks — 获取队列中等待被消费的任务。 */
  app.get(
    '/api/queue/pending-tasks',
    {
      schema: {
        response: {
          200: OkResponse(PendingTasksDataSchema),
          500: FailResponse(),
        },
      },
    },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const queue = app.services.getOptional('queue') as BullQueue | undefined
      if (queue === undefined) {
        await reply.send(ok([]))
        return
      }

      try {
        const jobs = await queue.getWaiting()
        await reply.send(ok(jobs.map(mapPendingJob)))
      } catch (err) {
        log.warn({ err }, '获取待处理任务失败')
        await reply.send(ok([]))
      }
    },
  )

  /**
   * GET /api/queue/stream — SSE 端点，实时推送队列状态数据。
   */
  app.get(
    '/api/queue/stream',
    {
      schema: { querystring: QueueStreamQuerySchema, hide: true },
    },
    async (req: FastifyRequest<{ Querystring: { interval?: string } }>, reply: FastifyReply) => {
      const intervalSecs = req.query.interval !== undefined ? parseFloat(req.query.interval) : 5.0

      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('X-Accel-Buffering', 'no')
      reply.raw.setHeader('Connection', 'keep-alive')

      let timer: NodeJS.Timeout | undefined

      const cleanup = (): void => {
        if (timer !== undefined) {
          clearInterval(timer)
          timer = undefined
        }
        if (!reply.raw.writableEnded) {
          reply.raw.end()
        }
      }

      timer = setInterval(() => {
        const sendUpdate = async (): Promise<void> => {
          // 连接已关闭时跳过并清理
          if (reply.raw.writableEnded) {
            cleanup()
            return
          }
          try {
            const { scheduledTasks, activeTasks, pendingTasks, workers, totalLength } =
              await collectQueueState(app)

            const payload = JSON.stringify({
              scheduledTasks,
              activeTasks,
              reservedTasks: [],
              pendingTasks,
              workers,
              queueLength: { queue: 'bullmq', length: totalLength },
            })
            reply.raw.write(`data: ${payload}\n\n`)
          } catch (err) {
            log.warn({ err }, '队列流数据收集失败')
          }
        }
        sendUpdate().catch((err: unknown) => {
          log.warn({ err }, '队列流执行失败')
        })
      }, intervalSecs * 1000)

      req.raw.on('close', cleanup)

      await new Promise<void>((resolve) => {
        req.raw.on('close', resolve)
      })
    },
  )
}

export default queueRoutes
export { queueRoutes }
