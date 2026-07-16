/** TaskExecutor —— 监听 BullMQ QueueEvents，按 job result 执行 Bot API。 */

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { MessageSegment } from '@aemeath-projects/napcat/types'
import { Job, Queue, QueueEvents } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'

import { isBotActionResult, isSelfContainedResult } from './models.js'
import type { BotActionJobResult } from './models.js'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { RedisStore } from '@/core/redis/index.js'

const log: PinoLogger = getLogger('tasks:executor') as unknown as PinoLogger

export class TaskExecutor {
  private readonly events: QueueEvents
  private readonly queue: Queue

  constructor(
    private readonly cache: RedisStore,
    private readonly router: MessageRouter,
    connection: ConnectionOptions,
    queueName: string,
    private readonly sendDelayMs = 500,
  ) {
    this.events = new QueueEvents(queueName, { connection })
    this.queue = new Queue(queueName, { connection })
  }

  /** 启动监听，订阅 QueueEvents 的 completed 事件。 */
  start(): void {
    this.events.on(
      'completed',
      ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
        void this._onCompleted(jobId, returnvalue)
      },
    )
    log.info('TaskExecutor 已启动')
  }

  /** 关闭 QueueEvents 连接。 */
  async close(): Promise<void> {
    await Promise.all([this.events.close(), this.queue.close()])
  }

  private async _onCompleted(jobId: string, returnvalue: unknown): Promise<void> {
    const job = await Job.fromId(this.queue, jobId)
    const jobName = job?.name ?? 'unknown'

    const result = returnvalue

    if (isSelfContainedResult(result)) {
      log.info({ jobName, summary: result.summary }, '自闭环任务完成')
      return
    }

    if (isBotActionResult(result)) {
      await this._executeBotActions(result, jobName)
      return
    }

    log.warn({ jobName, result }, '未知的 job result 类型')
  }

  private async _executeBotActions(result: BotActionJobResult, jobName: string): Promise<void> {
    // 所有调用统一走 MessageRouter：路由对业务透明，Router 内部无候选账号时会抛
    // AppError(503)，已在下方逐 call 的 try/catch 中捕获并记录，不需要前置判断
    // "是否有 master 在线"——这曾导致"只有 normal 账号在线"时被误判为不可用。
    for (const call of result.calls) {
      try {
        switch (call.method) {
          case 'sendGroupMsg': {
            const [groupId, message] = call.args as [string, MessageSegment[]]
            await this.router.sendGroupMsg(groupId, message)
            break
          }
          case 'sendGroupSign': {
            const [groupId] = call.args as [string]
            await this.router.sendGroupSign(groupId)
            break
          }
          case 'sendLike': {
            const [userId, times] = call.args as [string, number]
            await this.router.sendLike(userId, times)
            break
          }
          case 'sendMsg': {
            const [params] = call.args as [
              {
                messageType: 'group' | 'private'
                groupId?: string
                userId?: string
                message: MessageSegment[]
              },
            ]
            if (params.messageType === 'group' && params.groupId != null) {
              await this.router.sendGroupMsg(params.groupId, params.message)
            } else if (params.messageType === 'private' && params.userId != null) {
              await this.router.sendPrivateMsg(params.userId, params.message)
            }
            break
          }
          default:
            log.warn({ jobName, method: call.method }, 'Bot API 方法不在白名单，已拒绝')
        }
      } catch (err) {
        log.error({ jobName, method: call.method, err }, 'Bot API 调用失败')
      }

      if (result.calls.length > 1) {
        await new Promise<void>((r) => setTimeout(r, this.sendDelayMs))
      }
    }

    // 执行声明式 post-cache 操作
    if (result.postCacheOps && result.postCacheOps.length > 0) {
      for (const op of result.postCacheOps) {
        try {
          if (op.action === 'set') {
            await this.cache.set(op.key, op.value ?? '1', op.ttl ?? 0)
          } else {
            await this.cache.del(op.key)
          }
        } catch (err) {
          log.error({ jobName, op, err }, 'postCacheOp 执行失败')
        }
      }
    }
  }
}
