/** Iris 聊天记录归档 BullMQ 处理器。 */

import type { Job } from 'bullmq'

import { loadConfig } from '@/core/config.js'
import type { IrisPrismaClient, AemeathPrismaClient } from '@/core/db/index.js'
import { IrisArchiveService } from '@/core/iris/archive.js'
import { IrisS3 } from '@/core/iris/s3.js'
import type { OssBundle } from '@/core/oss/index.js'
import type { SelfContainedJobResult, TaskDefinition } from '@/core/tasks/index.js'

export interface ArchiveJobData {
  groupId?: string // BigInt 序列化为 string
}

export interface ArchiveWorkerDeps {
  db: AemeathPrismaClient
  // eslint-disable-next-line @typescript-eslint/naming-convention
  iris_db: IrisPrismaClient
  oss: OssBundle
}

export async function archiveIrisProcessor(
  job: Job<ArchiveJobData>,
  deps: ArchiveWorkerDeps,
): Promise<SelfContainedJobResult> {
  const config = loadConfig()

  if (!config.S3_ENDPOINT_URL) {
    return { type: 'self-contained', summary: { status: 'skipped', reason: 'S3 未配置' } }
  }

  const { client, buckets } = deps.oss
  const irisS3 = new IrisS3(client, buckets.iris)

  const service = new IrisArchiveService(
    deps.iris_db,
    deps.db,
    { retentionMonths: 6, batchSize: 5000, compression: 'zstd' },
    irisS3,
    config.TMPDIR,
  )

  const groupId = job.data.groupId != null ? BigInt(job.data.groupId) : undefined
  const result = await service.archive(groupId)

  return { type: 'self-contained', summary: result as unknown as Record<string, unknown> }
}

export const taskDefinition: TaskDefinition = {
  jobName: 'iris_archive',
  requires: ['iris_db', 'db', 'oss'],
  concurrency: 1,
  schedule: { cron: '0 3 1 * *', tz: 'Asia/Shanghai' },
  processor: async (job: Job, deps: Record<string, unknown>): Promise<SelfContainedJobResult> => {
    return archiveIrisProcessor(job as Job<ArchiveJobData>, deps as unknown as ArchiveWorkerDeps)
  },
}
