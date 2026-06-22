/**
 * OneBot 专属路由装饰器 —— 基于 exostrider @OnEvent 的快捷包装。
 */
import { OnEvent } from '@aemeath-projects/exostrider/dispatch'

/** 匹配 notice 事件。 */
export function OnNotice(noticeType: string) {
  return OnEvent({ postType: 'notice', noticeType })
}

/** 匹配戳一戳事件。 */
export function OnPoke() {
  return OnEvent({ postType: 'notice', noticeType: 'notify', subType: 'poke' })
}

/** 匹配精华消息事件。 */
export function OnEssence(subType?: string) {
  return OnEvent({
    postType: 'notice',
    noticeType: 'essence',
    ...(subType !== undefined ? { subType } : {}),
  })
}

/** 匹配 request 事件。 */
export function OnRequest(requestType: string) {
  return OnEvent({ postType: 'request', requestType })
}

/** 匹配 message_sent 事件（机器人自身发送的消息）。 */
export function OnMessageSent() {
  return OnEvent({ postType: 'message_sent' })
}

/** 匹配离线文件事件。 */
export function OnOffline() {
  return OnEvent({ postType: 'notice', noticeType: 'offline_file' })
}
