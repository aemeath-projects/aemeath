/**
 * 事件解析 —— 将 JSON 对象转换为对应类型的 OneBotEvent 子类。
 */

import type { OneBotEvent } from './models/base.js'
import type {
  AnyOneBotEvent,
  BotOfflineNotice,
  EssenceNotice,
  FriendAddNotice,
  FriendRecallNotice,
  FriendRequestEvent,
  GrayTipNotify,
  GroupAdminNotice,
  GroupBanNotice,
  GroupCardNotice,
  GroupDecreaseNotice,
  GroupIncreaseNotice,
  GroupMessageEvent,
  GroupMsgEmojiLikeNotice,
  GroupNameNotify,
  GroupRecallNotice,
  GroupRequestEvent,
  GroupUploadNotice,
  HeartbeatEvent,
  InputStatusNotify,
  LifecycleEvent,
  MessageSentEvent,
  NoticeEvent,
  NotifyEvent,
  PokeNotify,
  PrivateMessageEvent,
  ProfileLikeNotify,
  RequestEvent,
  TitleNotify,
} from './models/events.js'

/** 原始事件对象的最小结构（用于类型安全地读取鉴别字段）。 */
interface RawEvent {
  time?: unknown
  self_id?: unknown
  post_type?: unknown
  message_type?: unknown
  meta_event_type?: unknown
  notice_type?: unknown
  sub_type?: unknown
  request_type?: unknown
  [key: string]: unknown
}

// 映射表：notice_type -> 通知事件构造工厂
const NOTICE_MAP: Record<string, (data: RawEvent) => NoticeEvent> = {
  friend_add: (d) => d as unknown as FriendAddNotice,
  friend_recall: (d) => d as unknown as FriendRecallNotice,
  group_upload: (d) => d as unknown as GroupUploadNotice,
  group_admin: (d) => d as unknown as GroupAdminNotice,
  group_decrease: (d) => d as unknown as GroupDecreaseNotice,
  group_increase: (d) => d as unknown as GroupIncreaseNotice,
  group_ban: (d) => d as unknown as GroupBanNotice,
  group_recall: (d) => d as unknown as GroupRecallNotice,
  group_card: (d) => d as unknown as GroupCardNotice,
  essence: (d) => d as unknown as EssenceNotice,
  group_msg_emoji_like: (d) => d as unknown as GroupMsgEmojiLikeNotice,
  bot_offline: (d) => d as unknown as BotOfflineNotice,
}

// 映射表：notify 子类型 -> 通知事件构造工厂
const NOTIFY_SUBTYPE_MAP: Record<string, (data: RawEvent) => NotifyEvent> = {
  poke: (d) => d as unknown as PokeNotify,
  group_name: (d) => d as unknown as GroupNameNotify,
  title: (d) => d as unknown as TitleNotify,
  profile_like: (d) => d as unknown as ProfileLikeNotify,
  input_status: (d) => d as unknown as InputStatusNotify,
  gray_tip: (d) => d as unknown as GrayTipNotify,
}

/**
 * 将原始 JSON 对象解析为对应的 OneBotEvent 类型。
 *
 * @param data - 从 WebSocket 收到的原始数据对象
 * @returns 对应类型的 OneBotEvent
 */
export function parseEvent(data: unknown): AnyOneBotEvent {
  if (typeof data !== 'object' || data === null) {
    const fallback: OneBotEvent = { time: 0, self_id: 0, post_type: 'unknown' }
    return fallback
  }

  const raw = data as RawEvent
  const postType = typeof raw.post_type === 'string' ? raw.post_type : ''

  switch (postType) {
    case 'message':
      return parseMessage(raw)
    case 'message_sent':
      return raw as unknown as MessageSentEvent
    case 'meta_event':
      return parseMeta(raw)
    case 'notice':
      return parseNotice(raw)
    case 'request':
      return parseRequest(raw)
    default:
      return raw as unknown as OneBotEvent
  }
}

function parseMessage(data: RawEvent): PrivateMessageEvent | GroupMessageEvent {
  const msgType = typeof data.message_type === 'string' ? data.message_type : ''

  if (msgType === 'group') {
    return data as unknown as GroupMessageEvent
  }
  // 默认回退到 private
  return data as unknown as PrivateMessageEvent
}

function parseMeta(data: RawEvent): LifecycleEvent | HeartbeatEvent | OneBotEvent {
  const metaType = typeof data.meta_event_type === 'string' ? data.meta_event_type : ''

  if (metaType === 'lifecycle') {
    return data as unknown as LifecycleEvent
  }
  if (metaType === 'heartbeat') {
    return data as unknown as HeartbeatEvent
  }
  return data as unknown as OneBotEvent
}

function parseNotice(data: RawEvent): NoticeEvent {
  const noticeType = typeof data.notice_type === 'string' ? data.notice_type : ''

  if (noticeType === 'notify') {
    const subType = typeof data.sub_type === 'string' ? data.sub_type : ''
    const factory = NOTIFY_SUBTYPE_MAP[subType]
    if (factory) {
      return factory(data)
    }
    return data as unknown as NotifyEvent
  }

  const factory = NOTICE_MAP[noticeType]
  if (factory) {
    return factory(data)
  }
  return data as unknown as NoticeEvent
}

function parseRequest(data: RawEvent): FriendRequestEvent | GroupRequestEvent | RequestEvent {
  const reqType = typeof data.request_type === 'string' ? data.request_type : ''

  if (reqType === 'friend') {
    return data as unknown as FriendRequestEvent
  }
  if (reqType === 'group') {
    return data as unknown as GroupRequestEvent
  }
  return data as unknown as RequestEvent
}
