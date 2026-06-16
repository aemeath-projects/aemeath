/**
 * 任务队列 API 请求/响应 Schema（TypeBox）。
 *
 * 覆盖 SSE 实时推送端点的查询参数校验，
 * 以及各监控端点的响应数据校验。
 */

import { Type } from '@sinclair/typebox'

/** 队列 SSE 流查询参数 —— GET /api/queue/stream */
export const QueueStreamQuerySchema = Type.Object({
  interval: Type.Optional(
    Type.String({ pattern: '^\\d+(\\.\\d+)?$', description: '推送间隔（秒，默认 5）' }),
  ),
})

/* ──── 响应数据 Schema ──── */

/** 定时任务条目 Schema。 */
const ScheduledTaskSchema = Type.Object({
  name: Type.String(),
  task: Type.String(),
  schedule: Type.String(),
  scheduleRaw: Type.Null(),
  args: Type.Null(),
  kwargs: Type.Null(),
  options: Type.Object({
    expires: Type.Null(),
    queue: Type.String(),
  }),
  enabled: Type.Boolean(),
})

/** 活跃任务条目 Schema。 */
const ActiveTaskSchema = Type.Object({
  worker: Type.String(),
  id: Type.String(),
  name: Type.String(),
  args: Type.String(),
  kwargs: Type.String(),
  started: Type.Union([Type.Number(), Type.Null()]),
  acknowledged: Type.Boolean(),
})

/** 待处理任务条目 Schema。 */
const PendingTaskSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  args: Type.String(),
  kwargs: Type.Null(),
})

/** Worker 信息 Schema。 */
const WorkerInfoSchema = Type.Object({
  name: Type.String(),
  concurrency: Type.Null(),
  broker: Type.String(),
  prefetch_count: Type.Null(),
  pid: Type.Union([Type.Number(), Type.Null()]),
  uptime: Type.Null(),
})

/** 队列长度响应数据 Schema。 */
export const QueueLengthDataSchema = Type.Object({
  queue: Type.String(),
  length: Type.Union([Type.Number(), Type.Null()]),
})

/* ──── 列表响应数据 Schema ──── */

/** 定时任务列表响应数据 —— GET /api/queue/scheduled-tasks */
export const ScheduledTasksDataSchema = Type.Array(ScheduledTaskSchema)

/** 活跃任务列表响应数据 —— GET /api/queue/active-tasks */
export const ActiveTasksDataSchema = Type.Array(ActiveTaskSchema)

/** 预留任务列表响应数据 —— GET /api/queue/reserved-tasks（始终为空数组） */
export const ReservedTasksDataSchema = Type.Array(Type.Unknown())

/** Worker 列表响应数据 —— GET /api/queue/workers */
export const WorkersDataSchema = Type.Array(WorkerInfoSchema)

/** 待处理任务列表响应数据 —— GET /api/queue/pending-tasks */
export const PendingTasksDataSchema = Type.Array(PendingTaskSchema)
