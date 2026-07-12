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

import type { MessageRouter } from '@/core/accounts/index.js'
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

    if (isRenderSendResult(result)) {
      await this._executeRenderSend(result)
      return
    }

    log.warn({ jobName, result }, '未知的 job result 类型')
  }

  private async _executeBotActions(result: BotActionJobResult, jobName: string): Promise<void> {
    // 本方法内调用的 msgApi/friendApi/groupApi 均为 master 专属通道（见 main.ts 装配），
    // 前置检查须按 master 角色过滤，而非任意角色——否则"无 master、有 normal 账号在线"
    // 这种被明确支持的部署形态下，每次触发都会因 API 调用失败而报 error 日志噪音。
    if (this.pool.getAvailableClients('master').length === 0) {
      log.warn({ jobName }, '无可用账号，跳过 Bot API 调用')
      return
    }

    for (const call of result.calls) {
      try {
        switch (call.method) {
          case 'sendGroupMsg': {
            const [groupId, message] = call.args as [string, MessageSegment[]]
            await this.msgApi.sendGroupMsg(Number(groupId), message)
            break
          }
          case 'sendGroupSign': {
            const [groupId] = call.args as [string]
            await this.groupApi.sendGroupSign(Number(groupId))
            break
          }
          case 'sendLike': {
            const [userId, times] = call.args as [string, number]
            await this.friendApi.sendLike(Number(userId), times)
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
              await this.msgApi.sendGroupMsg(Number(params.groupId), params.message)
            } else if (params.messageType === 'private' && params.userId != null) {
              await this.msgApi.sendPrivateMsg(Number(params.userId), params.message)
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
    const b64 = await this.cache.get<string>(result.tempKey)
    if (b64 === null) {
      log.warn({ tempKey: result.tempKey }, 'render-send temp key 已过期，静默丢弃')
      return
    }

    const imageSegment = seg.image(`base64://${b64}`)

    // render-send 是面向任意 handler 触发者的通用回复通道（如 /help），与 _executeBotActions
    // 不同，不应绑定 master 专属通道——走 MessageRouter 才能在只有 normal 账号在线时也能送达。
    try {
      if ('groupId' in result.sendTo) {
        await this.router.sendGroupMsg(result.sendTo.groupId, [imageSegment])
      } else {
        await this.router.sendPrivateMsg(result.sendTo.userId, [imageSegment])
      }
    } catch (err) {
      log.error({ tempKey: result.tempKey, err }, 'render-send Bot API 调用失败')
    } finally {
      // 无论发送成功与否均清理 temp key，避免 TTL 内二次消费
      await this.cache.del(result.tempKey).catch(() => undefined)
    }
  }
}
