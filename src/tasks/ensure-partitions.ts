/** 聊天库分区预创建 BullMQ 处理器骨架 —— 具体业务逻辑后续迭代。 */

import type { Job } from 'bullmq'

import type { ChatPrismaClient } from '@/core/db/client.js'
import type { SelfContainedJobResult } from '@/core/tasks/models.js'

export const JOB_NAME = 'ensure-chat-partitions' as const

export interface PartitionsWorkerDeps {
  chatDb: ChatPrismaClient
}

export async function ensurePartitionsProcessor(
  _job: Job,
  _deps: PartitionsWorkerDeps,
): Promise<SelfContainedJobResult> {
  return { type: 'self-contained', summary: { status: 'not-implemented' } }
}
