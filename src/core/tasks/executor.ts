/** TaskExecutor —— 监听 BullMQ QueueEvents，按 job result 执行 Bot API。 */

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { ClientPool } from '@aemeath-projects/exostrider/pool'
import { seg } from '@aemeath-projects/napcat'
import type { FriendApi, GroupApi, MessageApi, NapCatClient } from '@aemeath-projects/napcat'
import type { MessageSegment } from '@aemeath-projects/napcat/types'
import { Job, Queue, QueueEvents } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'

import { isBotActionResult, isRenderSendResult, isSelfContainedResult } from './models.js'
import type { BotActionJobResult, RenderSendJobResult } from './models.js'

import type { RedisStore } from '@/core/redis/index.js'

const log: PinoLogger = getLogger('tasks:executor') as unknown as PinoLogger

export class TaskExecutor {
  private readonly events: QueueEvents
  private readonly queue: Queue

  constructor(
    private readonly msgApi: MessageApi,
    private readonly friendApi: FriendApi,
    private readonly groupApi: GroupApi,
    private readonly pool: ClientPool<NapCatClient, string, unknown>,
    private readonly cache: RedisStore,
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
      ({ jobId, returnvalue }: { jobId: string; returnvalue: string }) => {
        void this._onCompleted(jobId, returnvalue)
      },
    )
    log.info('TaskExecutor 已启动')
  }

  /** 关闭 QueueEvents 连接。 */
  async close(): Promise<void> {
    await Promise.all([this.events.close(), this.queue.close()])
  }

  private async _onCompleted(jobId: string, returnvalue: string): Promise<void> {
    const job = await Job.fromId(this.queue, jobId)
    const jobName = job?.name ?? 'unknown'

    let result: unknown
    try {
      result = JSON.parse(returnvalue) as unknown
    } catch {
      log.error({ jobId, jobName }, 'job result 解析失败')
      return
    }

    if (isSelfContainedResult(result)) {
      log.info({ jobName, summary: result.summary }, '自闭环任务完成')
      return
    }

    if (isBotActionResult(result)) {
      await this._executeBotActions(result, jobName)
      return
    }

    if (isRenderSendResult(result)) {
      await this._executeRenderSend(result)
      return
    }

    log.warn({ jobName, result }, '未知的 job result 类型')
  }

  private async _executeBotActions(result: BotActionJobResult, jobName: string): Promise<void> {
    if (this.pool.getAvailableClients().length === 0) {
      log.warn({ jobName }, '无可用账号，跳过 Bot API 调用')
      return
    }

    for (const call of result.calls) {
      try {
        switch (call.method) {
          case 'sendGroupMsg': {
            const [groupId, message] = call.args as [number, MessageSegment[]]
            await this.msgApi.sendGroupMsg(groupId, message)
            break
          }
          case 'sendGroupSign': {
            const [groupId] = call.args as [number]
            await this.groupApi.sendGroupSign(groupId)
            break
          }
          case 'sendLike': {
            const [userId, times] = call.args as [number, number]
            await this.friendApi.sendLike(userId, times)
            break
          }
          case 'sendMsg': {
            const [params] = call.args as [
              {
                messageType: 'group' | 'private'
                groupId?: number
                userId?: number
                message: MessageSegment[]
              },
            ]
            if (params.messageType === 'group' && params.groupId != null) {
              await this.msgApi.sendGroupMsg(params.groupId, params.message)
            } else if (params.messageType === 'private' && params.userId != null) {
              await this.msgApi.sendPrivateMsg(params.userId, params.message)
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

  private async _executeRenderSend(result: RenderSendJobResult): Promise<void> {
    if (this.pool.getAvailableClients().length === 0) {
      log.warn({ tempKey: result.tempKey }, '无可用账号，跳过 render-send')
      return
    }

    const b64 = await this.cache.get<string>(result.tempKey)
    if (b64 === null) {
      log.warn({ tempKey: result.tempKey }, 'render-send temp key 已过期，静默丢弃')
      return
    }

    const imageSegment = seg.image(`base64://${b64}`)

    try {
      if ('groupId' in result.sendTo) {
        await this.msgApi.sendGroupMsg(result.sendTo.groupId, [imageSegment])
      } else {
        await this.msgApi.sendPrivateMsg(result.sendTo.userId, [imageSegment])
      }
    } catch (err) {
      log.error({ tempKey: result.tempKey, err }, 'render-send Bot API 调用失败')
    } finally {
      // 无论发送成功与否均清理 temp key，避免 TTL 内二次消费
      await this.cache.del(result.tempKey).catch(() => undefined)
    }
  }
}
