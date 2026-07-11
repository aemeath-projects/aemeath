/**
 * OneBotDedupKeyExtractor —— OneBot 消息事件去重键提取策略。
 *
 * 使用 QQ 服务端分配的全局唯一雪花ID（messageId）作为去重键，
 * 覆盖 message（群/私聊）与 message_sent（机器人自发消息回显）两类事件。
 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { DedupKeyExtractor } from '@aemeath-projects/exostrider/pool'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

const log: PinoLogger = getLogger('accounts') as unknown as PinoLogger

export class OneBotDedupKeyExtractor implements DedupKeyExtractor<AnyOneBotEvent> {
  extract(event: AnyOneBotEvent): string | null {
    if (event.postType === 'message' || event.postType === 'message_sent') {
      if (event.messageId == null) {
        log.warn({ postType: event.postType }, 'OneBot 消息事件缺失 messageId，跳过去重')
        return null
      }
      // AnyOneBotEvent 含裸 OneBotEvent 兜底成员（postType 非字面量类型），
      // postType 判别式无法把它从联合类型里完全排除，导致此处 messageId 类型
      // 仍残留非 number 分支，触发该规则；String() 在此处是安全的。
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return `m:${String(event.messageId)}`
    }
    return null
  }
}
