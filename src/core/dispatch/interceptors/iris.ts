/**
 * IrisInterceptor —— dispatch 级拦截器，将消息事件持久化到 iris 聊天记录库。
 *
 * 注意：必须注册到 EventDispatcher 的 dispatchInterceptors（而非 interceptors）。
 * exostrider 的 interceptors 是"handler 级"拦截器：每个匹配到的业务 handler 都会完整
 * 重跑一遍其 preHandle/postHandle/afterCompletion——命中 0 个 handler 时一次都不执行，
 * 命中 N 个 handler 时会重复执行 N 次。消息归档需要"无论是否命中业务 handler，每条
 * 消息都恰好归档一次"的语义，因此使用 dispatchInterceptors：每次 dispatch() 调用
 * 恰好执行一次，与匹配到的业务 handler 数量完全无关（详见 exostrider
 * DispatchInterceptor 类型定义）。
 */
import type { Context, DispatchInterceptor } from '@aemeath-projects/exostrider/dispatch'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { ContextApis } from '../adapter.js'

import type { IrisService } from '@/core/iris/index.js'

/** 将 OneBot 消息类型字符串映射为数字（与 Prisma schema 中的 SmallInt 对应）。 */
function resolveMessageType(messageType: string): number {
  if (messageType === 'private') return 1
  if (messageType === 'group') return 2
  // message_sent 等其他类型
  return 3
}

const log: PinoLogger = getLogger('iris-interceptor') as unknown as PinoLogger

export class IrisInterceptor implements DispatchInterceptor<AnyOneBotEvent, ContextApis> {
  constructor(private readonly irisService: IrisService) {}

  async preHandle(ctx: Context<AnyOneBotEvent, ContextApis>): Promise<boolean> {
    const event = ctx.event

    if (event.postType !== 'message') {
      log.debug({ postType: event.postType }, 'IrisInterceptor: 非消息事件，跳过归档')
      return true
    }

    const msgEvent = event as {
      postType: 'message'
      messageType: string
      messageId: number
      userId: number
      rawMessage: string
      message: unknown
      time: number
      sender: {
        nickname?: string | null
        card?: string | null
        role?: string | null
      }
      groupId?: number
    }

    try {
      await this.irisService.saveMessage({
        messageId: BigInt(msgEvent.messageId),
        messageType: resolveMessageType(msgEvent.messageType),
        groupId: msgEvent.groupId != null ? String(msgEvent.groupId) : undefined,
        userId: String(msgEvent.userId),
        rawMessage: msgEvent.rawMessage,
        segments: msgEvent.message,
        senderNickname: msgEvent.sender.nickname ?? '',
        senderCard: msgEvent.sender.card ?? null,
        senderRole: msgEvent.sender.role ?? null,
        createdAt: new Date(msgEvent.time * 1000),
      })
    } catch (err) {
      // 归档失败不应中断消息事件的其余拦截器/处理器链路。saveMessage() 内部
      // 已有 try/catch 且从不向上抛出，这里是防止未来该内部 catch 被误删的防御性兜底。
      log.error({ err }, '消息归档失败')
    }

    return true
  }
}
