/** 聊天记录归档 BullMQ 处理器骨架 —— 具体业务逻辑后续迭代。 */

import type { Job } from 'bullmq'

import type { ChatPrismaClient, MainPrismaClient } from '@/core/db/client.js'
import type { SelfContainedJobResult } from '@/core/tasks/models.js'

export const JOB_NAME = 'chat-archive' as const

export interface ArchiveWorkerDeps {
  db: MainPrismaClient
  chatDb: ChatPrismaClient
}

export async function chatArchiveProcessor(
  _job: Job,
  _deps: ArchiveWorkerDeps,
): Promise<SelfContainedJobResult> {
  return { type: 'self-contained', summary: { status: 'not-implemented' } }
}
