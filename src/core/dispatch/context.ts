/**
 * OneBotContext —— 继承 exostrider Context，追加 OneBot 便捷方法。
 */
import { Context, FinishError } from '@aemeath-projects/exostrider/dispatch'
import type {
  MessageSegment,
  AnyOneBotEvent,
  GroupMessageEvent,
} from '@aemeath-projects/napcat/types'

import type { ContextApis } from './adapter.js'

import { BotApiError } from '@/core/errors.js'

export { Context, FinishError }
export type { ContextApis }

/** 判断事件是否为群消息事件。 */
function isGroupEvent(event: AnyOneBotEvent): event is GroupMessageEvent {
  return (
    (event.postType === 'message' || event.postType === 'message_sent') &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (event as GroupMessageEvent).messageType === 'group'
  )
}

/** 文本消息段构造辅助。 */
function textSegment(text: string): MessageSegment {
  return { type: 'text', data: { text } }
}

/**
 * OneBot 事件处理上下文 —— 在 exostrider 泛型 Context 基础上追加 OneBot 专属便捷 API。
 */
export class OneBotContext extends Context<AnyOneBotEvent, ContextApis> {
  /** 从消息中提取纯文本。 */
  getPlaintext(): string {
    return this.getText() ?? ''
  }

  /**
   * 以单个字符串形式获取命令名之后的所有内容。
   * 例如消息 "/echo hello world" → "hello world"
   */
  getArgStr(): string {
    const text = this.getPlaintext()
    const idx = text.search(/\s/u)
    return idx === -1 ? '' : text.slice(idx + 1).trimStart()
  }

  /**
   * 向当前会话发送回复（覆盖基类 reply，返回 Promise<void> 以兼容基类签名）。
   * 群消息事件 → sendGroupMsg；私聊消息事件 → sendPrivateMsg。
   */
  override async reply(message: unknown): Promise<void> {
    await this._sendImpl(message as MessageSegment | MessageSegment[] | string)
  }

  /**
   * 向当前会话发送回复并返回 message_id（群/私聊消息事件有效）。
   */
  async replyGetId(
    message: MessageSegment | MessageSegment[] | string,
  ): Promise<number | undefined> {
    return this._sendImpl(message)
  }

  /** 内部发送实现，返回 message_id。 */
  private async _sendImpl(
    message: MessageSegment | MessageSegment[] | string,
  ): Promise<number | undefined> {
    const segments: MessageSegment[] = Array.isArray(message)
      ? message
      : typeof message === 'string'
        ? [textSegment(message)]
        : [message]

    if (isGroupEvent(this.event)) {
      const result = await this.apis.msgApi.sendGroupMsg(this.event.groupId, segments)
      if (!result.ok) throw new BotApiError(result.error.code, result.error.message)
      return result.data.messageId
    }

    const userId = (this.event as { userId?: number }).userId
    if (typeof userId === 'number') {
      const result = await this.apis.msgApi.sendPrivateMsg(userId, segments)
      if (!result.ok) throw new BotApiError(result.error.code, result.error.message)
      return result.data.messageId
    }
    return undefined
  }

  /** reply 的别名（发送并返回 message_id）。 */
  async send(message: MessageSegment | MessageSegment[] | string): Promise<number | undefined> {
    return this._sendImpl(message)
  }

  /**
   * 发送消息后中止后续处理器的执行（先 await reply，再抛出 FinishError）。
   * 注意：基类 finish() 是同步的，此方法不覆盖基类，而是作为便捷方法使用。
   * 若需要先发消息再终止，请使用：await ctx.replyGetId(msg); ctx.finish()
   */
  async finishWith(message?: MessageSegment | MessageSegment[] | string): Promise<never> {
    if (message !== undefined) await this.reply(message)
    throw new FinishError()
  }

  /** 撤回当前消息。 */
  async recall(): Promise<void> {
    const messageId = (this.event as { messageId?: number }).messageId
    if (typeof messageId === 'number') {
      const result = await this.apis.msgApi.deleteMsg(messageId)
      if (!result.ok) throw new BotApiError(result.error.code, result.error.message)
    }
  }

  /** 当前群 ID（仅群消息事件有值）。 */
  get groupId(): number | undefined {
    return isGroupEvent(this.event) ? this.event.groupId : undefined
  }

  /** 触发事件的用户 ID。 */
  get userId(): number {
    const uid = (this.event as { userId?: number }).userId
    return typeof uid === 'number' ? uid : 0
  }

  /** 当前消息 ID（仅消息事件有值）。 */
  get messageId(): number {
    const mid = (this.event as { messageId?: number }).messageId
    return typeof mid === 'number' ? mid : 0
  }

  /** 判断当前事件是否为群消息事件。 */
  isGroupEvent(): boolean {
    return isGroupEvent(this.event)
  }

  /** 判断当前事件是否为私聊消息事件。 */
  isPrivateEvent(): boolean {
    return (
      (this.event.postType === 'message' || this.event.postType === 'message_sent') &&
      (this.event as { messageType?: string }).messageType === 'private'
    )
  }
}
