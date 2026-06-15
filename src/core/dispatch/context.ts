/**
 * 事件上下文 —— 封装事件、Bot API 及便捷方法（TypeScript 移植自 context.py）。
 */

import type { FriendApi, GroupApi, MessageApi } from '@aemeath-projects/napcat'
import type {
  AnyOneBotEvent,
  GroupMessageEvent,
  MessageSegment,
} from '@aemeath-projects/napcat/types'

import { BotApiError } from '@/core/errors.js'

/** 由 ctx.finish() 抛出，用于中止后续处理器的执行。 */
export class FinishError extends Error {
  constructor() {
    super('FinishError: handler requested finish')
    this.name = 'FinishError'
  }
}

/** Context 注入的 Bot API 模块集合。 */
export interface ContextApis {
  readonly msgApi: MessageApi
  readonly friendApi: FriendApi
  readonly groupApi: GroupApi
}

/** 从消息事件中提取纯文本。 */
function extractPlaintext(event: AnyOneBotEvent): string {
  if (event.post_type !== 'message' && event.post_type !== 'message_sent') {
    return ''
  }
  const msg = (event as { message?: unknown }).message
  if (typeof msg === 'string') {
    return msg.trim()
  }
  if (!Array.isArray(msg)) {
    return ''
  }
  const parts: string[] = []
  for (const seg of msg as { type: string; data: Record<string, unknown> }[]) {
    if (seg.type === 'text') {
      const text = seg.data.text
      if (typeof text === 'string') {
        parts.push(text)
      }
    }
  }
  return parts.join('').trim()
}

/** 文本消息段构造辅助。 */
function textSegment(text: string): MessageSegment {
  return { type: 'text', data: { text } }
}

/** 事件记录视图（用于动态字段访问）。 */
type EventRecord = Record<string, unknown>

/** 判断事件是否为群消息事件。 */
function isGroupEvent(event: AnyOneBotEvent): event is GroupMessageEvent {
  return (
    (event.post_type === 'message' || event.post_type === 'message_sent') &&
    (event as EventRecord).message_type === 'group'
  )
}

/** 判断事件是否为私聊消息事件。 */
function isPrivateEvent(event: AnyOneBotEvent): boolean {
  return (
    (event.post_type === 'message' || event.post_type === 'message_sent') &&
    (event as EventRecord).message_type === 'private'
  )
}

/**
 * 事件处理上下文 —— 传递给拦截器和处理器。
 *
 * 包含：
 * - 当前事件（`event`）
 * - Bot API 客户端（`msgApi`、`friendApi`、`groupApi`）
 * - 正则匹配结果（`regexMatch`）
 * - 属性存储（供拦截器链传递数据）
 * - 消息辅助方法（`getPlaintext`、`getArgs`、`reply`、`finish` 等）
 *
 * 注意：服务依赖通过 @Inject 字段注入到 Handler 实例，Context 不再承担服务定位器职责。
 */
export class Context {
  /** 触发本次事件的原始事件对象。 */
  readonly event: AnyOneBotEvent

  /** 消息发送/撤回 API。 */
  readonly msgApi: MessageApi

  /** 好友相关 API。 */
  readonly friendApi: FriendApi

  /** 群组相关 API。 */
  readonly groupApi: GroupApi

  private _regexMatch: RegExpMatchArray | null = null
  private readonly _attributes = new Map<string, unknown>()

  constructor(event: AnyOneBotEvent, apis: ContextApis) {
    this.event = event
    this.msgApi = apis.msgApi
    this.friendApi = apis.friendApi
    this.groupApi = apis.groupApi
  }

  /* 属性存储（拦截器 <-> 处理器数据传递） */

  setAttribute(key: string, value: unknown): void {
    this._attributes.set(key, value)
  }

  getAttribute(key: string): unknown {
    return this._attributes.get(key)
  }

  /* 正则匹配（由调度器在 OnRegex 时设置） */

  setRegexMatch(match: RegExpMatchArray): void {
    this._regexMatch = match
  }

  getRegexMatch(): RegExpMatchArray | null {
    return this._regexMatch
  }

  /* 消息辅助方法 */

  /** 从消息中提取纯文本。 */
  getPlaintext(): string {
    return extractPlaintext(this.event)
  }

  /**
   * 提取命令参数（命令名之后的文本）。
   * 例如消息 "/echo hello world" → ["hello", "world"]
   */
  getArgs(): string[] {
    const text = this.getPlaintext()
    const parts = text.split(/\s+/u)
    // parts[0] 是命令名，之后的才是参数
    return parts.slice(1).filter((s) => s.length > 0)
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

  /* 回复 / 发送快捷方法 */

  /**
   * 向当前会话发送回复。
   * 群消息事件 → send_group_msg；私聊消息事件 → send_private_msg。
   * 内部解包 SDK Result，失败时抛出 BotApiError。
   *
   * @returns 发送成功时的 message_id；非消息事件返回 undefined
   */
  async reply(message: MessageSegment | MessageSegment[] | string): Promise<number | undefined> {
    const segments: MessageSegment[] = Array.isArray(message)
      ? message
      : typeof message === 'string'
        ? [textSegment(message)]
        : [message]

    if (isGroupEvent(this.event)) {
      const result = await this.msgApi.sendGroupMsg(this.event.group_id, segments)
      if (!result.ok) {
        throw new BotApiError(result.error.code, result.error.message)
      }
      return result.data.message_id
    } else if (isPrivateEvent(this.event)) {
      const userId = (this.event as EventRecord).user_id
      if (typeof userId === 'number') {
        const result = await this.msgApi.sendPrivateMsg(userId, segments)
        if (!result.ok) {
          throw new BotApiError(result.error.code, result.error.message)
        }
        return result.data.message_id
      }
    }
    return undefined
  }

  /** reply 的别名。 */
  async send(message: MessageSegment | MessageSegment[] | string): Promise<number | undefined> {
    return this.reply(message)
  }

  /**
   * 发送消息并中止后续处理器的执行。
   * 抛出 FinishError，调度器捕获后停止处理器链。
   */
  async finish(message?: MessageSegment | MessageSegment[] | string): Promise<never> {
    if (message !== undefined) {
      await this.reply(message)
    }
    throw new FinishError()
  }

  /** 撤回当前消息（仅消息事件有效）。失败时抛出 BotApiError。 */
  async recall(): Promise<void> {
    const messageId = (this.event as EventRecord).message_id
    if (typeof messageId === 'number') {
      const result = await this.msgApi.deleteMsg(messageId)
      if (!result.ok) {
        throw new BotApiError(result.error.code, result.error.message)
      }
    }
  }

  /* 便捷属性 */

  /** 判断当前事件是否为群消息事件。 */
  isGroupEvent(): boolean {
    return isGroupEvent(this.event)
  }

  /** 判断当前事件是否为私聊消息事件。 */
  isPrivateEvent(): boolean {
    return isPrivateEvent(this.event)
  }

  /** 当前群 ID（仅群消息事件有值）。 */
  get groupId(): number | undefined {
    if (isGroupEvent(this.event)) {
      return this.event.group_id
    }
    return undefined
  }

  /** 触发事件的用户 ID。 */
  get userId(): number {
    const uid = (this.event as EventRecord).user_id
    return typeof uid === 'number' ? uid : 0
  }

  /** 当前消息 ID（仅消息事件有值）。 */
  get messageId(): number {
    const mid = (this.event as EventRecord).message_id
    return typeof mid === 'number' ? mid : 0
  }
}
