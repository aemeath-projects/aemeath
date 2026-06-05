/**
 * 消息段链式构建器。
 */

import type {
  AtSegment,
  ContactSegment,
  DiceSegment,
  FaceSegment,
  FileSegment,
  ForwardSegment,
  ImageSegment,
  JsonSegment,
  LocationSegment,
  MarkdownSegment,
  MessageSegment,
  MFaceSegment,
  MusicSegment,
  NodeSegment,
  PokeSegment,
  RecordSegment,
  ReplySegment,
  RpsSegment,
  ShareSegment,
  TextSegment,
  VideoSegment,
} from './models/segments.js'

/** 构建纯文本消息段。 */
function text(content: string): TextSegment {
  return { type: 'text', data: { text: content } }
}

/** 构建表情消息段。 */
function face(id: number): FaceSegment {
  return { type: 'face', data: { id } }
}

/** 构建图片消息段。 */
function image(file: string, extra?: Record<string, unknown>): ImageSegment {
  return { type: 'image', data: { file, ...extra } }
}

/** 构建语音消息段。 */
function record(file: string, extra?: Record<string, unknown>): RecordSegment {
  return { type: 'record', data: { file, ...extra } }
}

/** 构建视频消息段。 */
function video(file: string, extra?: Record<string, unknown>): VideoSegment {
  return { type: 'video', data: { file, ...extra } }
}

/** 构建 @提及消息段。qq 可以是数字 QQ 号或 "all"。 */
function at(qq: bigint | number | string): AtSegment {
  return { type: 'at', data: { qq: String(qq) } }
}

/** 构建引用回复消息段。 */
function reply(id: number): ReplySegment {
  return { type: 'reply', data: { id } }
}

/** 构建合并转发消息段。 */
function forward(id: string): ForwardSegment {
  return { type: 'forward', data: { id } }
}

/** 构建 JSON 富文本消息段。 */
function json(data: string | Record<string, unknown>): JsonSegment {
  return { type: 'json', data: { data } }
}

/** 构建音乐分享消息段。 */
function music(
  musicType: string,
  musicId?: string | null,
  extra?: Record<string, unknown>,
): MusicSegment {
  const d: Record<string, unknown> = { type: musicType }
  if (musicId != null) {
    d.id = musicId
  }
  return { type: 'music', data: { type: musicType, ...d, ...extra } }
}

/** 构建戳一戳消息段。 */
function poke(pokeType: string, id: string): PokeSegment {
  return { type: 'poke', data: { type: pokeType, id } }
}

/** 构建骰子消息段。 */
function dice(): DiceSegment {
  return { type: 'dice', data: {} }
}

/** 构建猜拳消息段。 */
function rps(): RpsSegment {
  return { type: 'rps', data: {} }
}

/** 构建联系人名片消息段。 */
function contact(contactType: string, id: string): ContactSegment {
  return { type: 'contact', data: { type: contactType, id } }
}

/** 构建转发消息节点消息段。 */
function node(opts?: {
  id?: number | null
  content?: unknown[] | null
  user_id?: number | null
  nickname?: string | null
}): NodeSegment {
  const d: Record<string, unknown> = {}
  if (opts?.id != null) d.id = opts.id
  if (opts?.content != null) d.content = opts.content
  if (opts?.user_id != null) d.user_id = opts.user_id
  if (opts?.nickname != null) d.nickname = opts.nickname
  return { type: 'node', data: d }
}

/** 构建文件消息段。 */
function file(filePath: string, extra?: Record<string, unknown>): FileSegment {
  return { type: 'file', data: { file: filePath, ...extra } }
}

/** 构建商城表情消息段（NapCat 扩展）。 */
function mface(opts?: {
  emoji_id?: string | null
  emoji_package_id?: string | null
  key?: string | null
  summary?: string | null
}): MFaceSegment {
  return { type: 'mface', data: { ...opts } }
}

/** 构建 Markdown 消息段。 */
function markdown(content?: string | null): MarkdownSegment {
  return { type: 'markdown', data: { content } }
}

/** 构建链接分享消息段。 */
function share(opts?: {
  url?: string | null
  title?: string | null
  content?: string | null
  image?: string | null
}): ShareSegment {
  return { type: 'share', data: { ...opts } }
}

/** 构建位置消息段。 */
function location(opts?: {
  lat?: number | null
  lon?: number | null
  title?: string | null
  content?: string | null
}): LocationSegment {
  return { type: 'location', data: { ...opts } }
}

/**
 * 消息段便捷工厂集合（命名空间风格）。
 */
export const Seg = {
  text,
  face,
  image,
  record,
  video,
  at,
  reply,
  forward,
  json,
  music,
  poke,
  dice,
  rps,
  contact,
  node,
  file,
  mface,
  markdown,
  share,
  location,
} as const

/**
 * 链式消息构建器。
 *
 * 用法：
 *   const msg = new MessageBuilder().text('Hello ').at(123456n).text(' world!').build()
 */
export class MessageBuilder {
  private readonly _segments: MessageSegment[] = []

  /** 添加任意消息段。 */
  add(seg: MessageSegment): this {
    this._segments.push(seg)
    return this
  }

  /** 添加文本消息段。 */
  text(content: string): this {
    return this.add(Seg.text(content))
  }

  /** 添加表情消息段。 */
  face(id: number): this {
    return this.add(Seg.face(id))
  }

  /** 添加图片消息段。 */
  image(filePath: string, extra?: Record<string, unknown>): this {
    return this.add(Seg.image(filePath, extra))
  }

  /** 添加语音消息段。 */
  record(filePath: string, extra?: Record<string, unknown>): this {
    return this.add(Seg.record(filePath, extra))
  }

  /** 添加 @提及消息段。 */
  at(qq: bigint | number | string): this {
    return this.add(Seg.at(qq))
  }

  /** 添加引用回复消息段。 */
  reply(id: number): this {
    return this.add(Seg.reply(id))
  }

  /** 构建并返回消息段数组（返回副本）。 */
  build(): MessageSegment[] {
    return [...this._segments]
  }
}

/**
 * 从消息段数组中提取纯文本内容。
 *
 * @param segments - 消息段数组
 * @returns 所有文本段拼接的纯文本字符串
 */
export function extractPlaintext(segments: MessageSegment[]): string {
  return segments
    .filter((seg): seg is TextSegment => seg.type === 'text' && typeof seg.data.text === 'string')
    .map((seg) => seg.data.text)
    .join('')
}

/**
 * 构建提及消息（群聊时在文本前自动插入 @）。
 *
 * @param content - 消息文本
 * @param userId - 要 @ 的用户 QQ 号
 * @param isGroup - 是否为群聊场景
 * @returns 私聊返回纯字符串；群聊返回含 at 段的消息段数组
 */
export function buildMentionMessage(
  content: string,
  userId: number,
  isGroup: boolean,
): string | MessageSegment[] {
  if (!isGroup) {
    return content
  }
  return [Seg.at(userId), Seg.text(` ${content}`)]
}
