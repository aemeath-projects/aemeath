/**
 * OneBot 事件适配层 —— 为 exostrider EventDispatcher 提供 ContextConfig。
 *
 * `ContextApis.msgApi`（见下方 `MsgApi` 接口）不是 `MessageRouter` 之上的另一层
 * 业务 API，而是绑定在单次入站事件上的 Handler 便捷门面：`sendGroupMsg`/
 * `sendPrivateMsg` 委托给 `MessageRouter`（"发给谁"和路由无关，应对业务透明），
 * `deleteMsg` 保留事件源客户端绑定（撤回操作必须由发出该消息的客户端执行）。
 * 不响应入站事件、由定时任务/队列触发的代码（如 `DailyCheckinService`、
 * `TaskExecutor`）没有 `ctx`，也就没有 `MsgApi` 可用，只能直接注入
 * `MessageRouter`——这不是架构不一致，是"有事件上下文用 ctx.reply()，
 * 没有则直接注入 message_router"两种场景各自该用的方式。
 */
import type { ContextConfig } from '@aemeath-projects/exostrider/dispatch'
import { GroupApi } from '@aemeath-projects/napcat'
import type { FriendApi, NapCatClient, Result } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent, MessageSegment } from '@aemeath-projects/napcat/types'

/**
 * Handler 便捷门面的消息发送接口——只声明 ctx.apis.msgApi 实际被使用的 3 个方法
 * （均在 dispatch/context.ts 内部调用），签名与 napcat SDK 的 MessageApi 保持一致，
 * 但不要求消费方依赖具体的 MessageApi 类。sendGroupMsg/sendPrivateMsg 由
 * buildContextApis() 的 Proxy 委托给 MessageRouter；deleteMsg 透传到事件源客户端
 * （撤回操作必须由发出该消息的客户端执行，不能路由到其他账号）。
 */
export interface MsgApi {
  sendGroupMsg(groupId: number, message: MessageSegment[]): Promise<Result<{ messageId: number }>>
  sendPrivateMsg(userId: number, message: MessageSegment[]): Promise<Result<{ messageId: number }>>
  deleteMsg(messageId: number): Promise<Result<void>>
}

/** Bot API 模块集合（由 BotClientBootstrap @Provide 注册）。 */
export interface ContextApis {
  readonly msgApi: MsgApi
  readonly friendApi: FriendApi
  groupApi: GroupApi // 非 readonly：允许 CapabilityInterceptor 替换
}

/** 从 OneBot 事件提取纯文本。 */
function extractPlaintext(event: AnyOneBotEvent): string {
  if (event.postType !== 'message' && event.postType !== 'message_sent') return ''
  const msg = (event as { message?: unknown }).message
  if (typeof msg === 'string') return msg.trim()
  if (!Array.isArray(msg)) return ''
  const parts: string[] = []
  for (const seg of msg as { type: string; data: Record<string, unknown> }[]) {
    if (seg.type === 'text') {
      const text = seg.data.text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('').trim()
}

/** 从 OneBot 事件提取消息作用域（group/private），供 @Scope 声明式过滤使用。非消息事件返回 undefined（不受 scope 限制）。 */
function extractScope(event: AnyOneBotEvent): string | undefined {
  if (event.postType !== 'message' && event.postType !== 'message_sent') return undefined
  const messageType = (event as { messageType?: string }).messageType
  return messageType === 'group' || messageType === 'private' ? messageType : undefined
}

/** OneBot ContextConfig：向 exostrider Context 注入文本提取逻辑。 */
export const oneBotContextConfig: ContextConfig<AnyOneBotEvent, ContextApis> = {
  textExtractor: (event) => extractPlaintext(event),
  argsExtractor: (event, _prefix) => {
    const text = extractPlaintext(event)
    const parts = text.split(/\s+/u)
    return parts.slice(1).filter((s) => s.length > 0)
  },
  scopeExtractor: (event) => extractScope(event),
}

/** 根据 NapCatClient 实例构建 GroupApi，供 CapabilityInterceptor 在替换账号时使用。 */
export function buildGroupApi(client: NapCatClient): GroupApi {
  return new GroupApi(client)
}
