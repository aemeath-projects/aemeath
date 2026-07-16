/** 站内信广播器 —— TypedEventEmitter，供 SSE 端点订阅新消息。 */

import { TypedEventEmitter } from '@aemeath-projects/exostrider/types'

import type { Mailbox } from '#prisma/aemeath'

interface MailboxEvents {
  mailbox: (item: Mailbox) => void
}

/**
 * 站内信广播器。
 *
 * `MailboxService.notifyAdmins()` 写库成功后调用 {@link MailboxBroadcaster.broadcast}，
 * `GET /api/mailbox/stream` 监听 `'mailbox'` 事件实时推送给前端。
 */
export class MailboxBroadcaster extends TypedEventEmitter<MailboxEvents> {
  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /** 广播一条新的站内信到所有监听器。 */
  broadcast(item: Mailbox): void {
    this.emit('mailbox', item)
  }
}

/** 全局单例，供 MailboxService 广播、SSE 路由订阅。 */
export const mailboxBroadcaster = new MailboxBroadcaster()
