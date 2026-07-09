/**
 * IrisInterceptor —— 全局最高优先级拦截器。
 * 拦截消息事件并存储到 iris 聊天记录库，对业务 handler 完全透明。
 * 多账号去重已在 ClientPool 层完成（Plan 3），此处直接存储去重后事件。
 */
import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
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

export class IrisInterceptor implements HandlerInterceptor<AnyOneBotEvent, ContextApis> {
  constructor(private readonly irisService: IrisService) {}

  async preHandle(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
  ): Promise<boolean> {
    const event = ctx.event

    if (event.postType !== 'message') return true

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

    return true
  }
}
