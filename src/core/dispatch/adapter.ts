/**
 * OneBot 事件适配层 —— 为 exostrider EventDispatcher 提供 ContextConfig。
 */
import type { ContextConfig } from '@aemeath-projects/exostrider/dispatch'
import { GroupApi } from '@aemeath-projects/napcat'
import type { FriendApi, MessageApi, NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

/** Bot API 模块集合（由 BotClientBootstrap @Provide 注册）。 */
export interface ContextApis {
  readonly msgApi: MessageApi
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

/** OneBot ContextConfig：向 exostrider Context 注入文本提取逻辑。 */
export const oneBotContextConfig: ContextConfig<AnyOneBotEvent, ContextApis> = {
  textExtractor: (event) => extractPlaintext(event),
  argsExtractor: (event, _prefix) => {
    const text = extractPlaintext(event)
    const parts = text.split(/\s+/u)
    return parts.slice(1).filter((s) => s.length > 0)
  },
}

/** 根据 NapCatClient 实例构建 GroupApi，供 CapabilityInterceptor 在替换账号时使用。 */
export function buildGroupApi(client: NapCatClient): GroupApi {
  return new GroupApi(client)
}
