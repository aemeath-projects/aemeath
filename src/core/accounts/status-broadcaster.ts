/** 账号连接状态广播器 —— TypedEventEmitter，供 SSE 端点订阅账号状态变化。 */
import { TypedEventEmitter } from '@aemeath-projects/exostrider/types'

import type { AccountWithStatus } from './service.js'

interface AccountStatusEvents {
  status: (status: AccountWithStatus) => void
}

/**
 * 账号状态广播器。
 *
 * `AccountService`（创建/更新账号时）与 `MultiAccountBootstrap`（连接状态变化时）
 * 调用 {@link AccountStatusBroadcaster.broadcast}，`GET /api/accounts/stream`
 * 监听 `'status'` 事件实时推送给前端。
 */
export class AccountStatusBroadcaster extends TypedEventEmitter<AccountStatusEvents> {
  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /** 广播一次账号状态变化到所有 SSE 订阅者。 */
  broadcast(status: AccountWithStatus): void {
    this.emit('status', status)
  }
}

/** 全局单例，供 AccountService / MultiAccountBootstrap 广播，SSE 路由订阅。 */
export const accountStatusBroadcaster = new AccountStatusBroadcaster()
