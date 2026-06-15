/** Task Echo 标准导出接口。 */
import type { Job } from 'bullmq'

export interface MinimalSettingSchema {
  readonly key: string
  readonly type: string
  readonly default: unknown
}

export interface ScheduleConfig {
  readonly cron: string
  readonly tz?: string
  readonly schedulerId?: string
}

export interface TaskDefinition {
  readonly jobName: string
  readonly processor: (job: Job, deps: Record<string, unknown>) => Promise<unknown>
  readonly requires?: readonly string[]
  readonly concurrency?: number
  readonly schedule?: ScheduleConfig | string
  readonly settings?: Record<string, MinimalSettingSchema>
}
