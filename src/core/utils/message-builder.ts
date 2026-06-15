/** 链式消息段构造器工具。 */

import { Seg } from '@aemeath-projects/napcat'
import type { ImageSegment, MessageSegment } from '@aemeath-projects/napcat/types'

/**
 * 链式消息构造器。
 *
 * 用法：
 *   const msg = new MessageBuilder().text('Hello ').at(123456).image(url).build()
 */
export class MessageBuilder {
  private readonly _segments: MessageSegment[] = []

  /** 追加任意消息段。 */
  add(seg: MessageSegment): this {
    this._segments.push(seg)
    return this
  }

  /** 追加文本消息段。 */
  text(content: string): this {
    return this.add(Seg.text(content))
  }

  /** 追加表情消息段。 */
  face(id: number): this {
    return this.add(Seg.face(id))
  }

  /** 追加图片消息段。 */
  image(file: string, opts?: Partial<ImageSegment['data']>): this {
    return this.add(Seg.image(file, opts))
  }

  /** 追加 @提及消息段。qq 为 number 或 'all'。 */
  at(qq: number | 'all'): this {
    return this.add(Seg.at(qq))
  }

  /** 追加引用回复消息段。 */
  reply(id: number): this {
    return this.add(Seg.reply(id))
  }

  /** 构建并返回消息段数组（副本）。 */
  build(): MessageSegment[] {
    return [...this._segments]
  }
}
