/** Iris 聊天记录广播器 —— TypedEventEmitter，供 SSE 端点订阅新入库消息。 */
import { TypedEventEmitter } from '@aemeath-projects/exostrider/types'

import type { ChatMessage } from '#prisma/iris'

interface IrisBroadcastEvents {
  message: (message: ChatMessage) => void
}

/**
 * Iris 消息广播器。
 *
 * `IrisService.saveMessage()` 写库成功后调用 {@link IrisBroadcaster.broadcast}，
 * `GET /api/iris/messages/stream` 监听 `'message'` 事件，按连接携带的
 * groupId/userId 过滤后推送给对应前端。
 */
export class IrisBroadcaster extends TypedEventEmitter<IrisBroadcastEvents> {
  constructor() {
    super()
    this.setMaxListeners(50)
  }

  /** 广播一条新入库的消息到所有监听器（未经过滤，由订阅者自行过滤）。 */
  broadcast(message: ChatMessage): void {
    this.emit('message', message)
  }
}

/** 全局单例，供 IrisService 广播、SSE 路由订阅。 */
export const irisMessageBroadcaster = new IrisBroadcaster()
