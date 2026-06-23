/**
 * OneBotDedupKeyExtractor —— OneBot 消息事件去重键提取策略。
 *
 * 优先级：messageSeq（QQ 服务端序列号）> 复合键（groupId+userId+time）
 * message_seq 跨账号一致性需在实现阶段抓包验证，若不一致改用复合键。
 */
import type { DedupKeyExtractor } from '@aemeath-projects/exostrider/pool'

export class OneBotDedupKeyExtractor implements DedupKeyExtractor<Record<string, unknown>> {
  extract(event: Record<string, unknown>): string | null {
    if (event.postType !== 'message') return null

    // 优先使用 message_seq（QQ 服务端序列号，跨账号应一致）
    if ('messageSeq' in event && 'groupId' in event && event.messageSeq != null) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return `g:${String(event.groupId)}:seq:${String(event.messageSeq)}`
    }

    // 群消息复合键
    if ('groupId' in event && 'userId' in event && 'time' in event) {
      return `g:${String(event.groupId)}:u:${String(event.userId)}:t:${String(event.time)}`
    }

    // 私聊消息
    if (event.messageType === 'private' && 'userId' in event && 'time' in event) {
      return `p:${String(event.userId)}:t:${String(event.time)}`
    }

    return null
  }
}
