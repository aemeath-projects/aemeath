import { describe, expect, it } from 'vitest'

import type { AtSegment } from '../../../../src/core/protocol/models/segments.js'
import {
  buildMentionMessage,
  extractPlaintext,
  MessageBuilder,
  Seg,
} from '../../../../src/core/protocol/segment.js'

describe('Seg factory methods', () => {
  it('Seg.text() returns correct text segment', () => {
    const seg = Seg.text('hello')
    expect(seg).toEqual({ type: 'text', data: { text: 'hello' } })
  })

  it('Seg.face() returns correct face segment', () => {
    const seg = Seg.face(21)
    expect(seg).toEqual({ type: 'face', data: { id: 21 } })
  })

  it('Seg.image() returns correct image segment', () => {
    const seg = Seg.image('file:///test.jpg')
    expect(seg.type).toBe('image')
    expect(seg.data.file).toBe('file:///test.jpg')
  })

  it('Seg.image() passes extra fields', () => {
    const seg = Seg.image('test.png', { url: 'https://example.com/test.png' })
    expect(seg.data.url).toBe('https://example.com/test.png')
  })

  it('Seg.record() returns correct record segment', () => {
    const seg = Seg.record('voice.silk')
    expect(seg.type).toBe('record')
    expect(seg.data.file).toBe('voice.silk')
  })

  it('Seg.video() returns correct video segment', () => {
    const seg = Seg.video('clip.mp4')
    expect(seg.type).toBe('video')
    expect(seg.data.file).toBe('clip.mp4')
  })

  it('Seg.at() with bigint returns correct AT segment', () => {
    const seg = Seg.at(123n)
    expect(seg).toEqual({ type: 'at', data: { qq: '123' } })
  })

  it('Seg.at() with number returns correct AT segment', () => {
    const seg = Seg.at(456)
    expect(seg).toEqual({ type: 'at', data: { qq: '456' } })
  })

  it('Seg.at() with "all" string returns correct AT segment', () => {
    const seg = Seg.at('all')
    expect(seg).toEqual({ type: 'at', data: { qq: 'all' } })
  })

  it('Seg.reply() returns correct reply segment', () => {
    const seg = Seg.reply(456)
    expect(seg).toEqual({ type: 'reply', data: { id: 456 } })
  })

  it('Seg.forward() returns correct forward segment', () => {
    const seg = Seg.forward('abc-forward-id')
    expect(seg).toEqual({ type: 'forward', data: { id: 'abc-forward-id' } })
  })

  it('Seg.json() returns correct json segment with string data', () => {
    const seg = Seg.json('{"key":"val"}')
    expect(seg.type).toBe('json')
    expect(seg.data.data).toBe('{"key":"val"}')
  })

  it('Seg.json() returns correct json segment with object data', () => {
    const seg = Seg.json({ key: 'val' })
    expect(seg.type).toBe('json')
    expect(seg.data.data).toEqual({ key: 'val' })
  })

  it('Seg.music() returns correct music segment', () => {
    const seg = Seg.music('qq', '12345')
    expect(seg.type).toBe('music')
    expect(seg.data.type).toBe('qq')
    expect(seg.data.id).toBe('12345')
  })

  it('Seg.music() without id', () => {
    const seg = Seg.music('163')
    expect(seg.type).toBe('music')
    expect(seg.data.id).toBeUndefined()
  })

  it('Seg.poke() returns correct poke segment', () => {
    const seg = Seg.poke('6', '126')
    expect(seg).toEqual({ type: 'poke', data: { type: '6', id: '126' } })
  })

  it('Seg.dice() returns correct dice segment', () => {
    const seg = Seg.dice()
    expect(seg).toEqual({ type: 'dice', data: {} })
  })

  it('Seg.rps() returns correct rps segment', () => {
    const seg = Seg.rps()
    expect(seg).toEqual({ type: 'rps', data: {} })
  })

  it('Seg.contact() returns correct contact segment', () => {
    const seg = Seg.contact('qq', '99999')
    expect(seg).toEqual({ type: 'contact', data: { type: 'qq', id: '99999' } })
  })

  it('Seg.node() returns empty node segment', () => {
    const seg = Seg.node()
    expect(seg.type).toBe('node')
    expect(seg.data).toEqual({})
  })

  it('Seg.node() with options', () => {
    const seg = Seg.node({ id: 42, nickname: 'test' })
    expect(seg.data.id).toBe(42)
    expect(seg.data.nickname).toBe('test')
  })

  it('Seg.file() returns correct file segment', () => {
    const seg = Seg.file('document.pdf')
    expect(seg.type).toBe('file')
    expect(seg.data.file).toBe('document.pdf')
  })
})

describe('extractPlaintext', () => {
  it('extracts text from text segments', () => {
    const segments = [Seg.text('hello'), Seg.text(' world')]
    expect(extractPlaintext(segments)).toBe('hello world')
  })

  it('ignores non-text segments', () => {
    const segments = [Seg.text('hello'), Seg.at(123n), Seg.text(' world'), Seg.face(1)]
    expect(extractPlaintext(segments)).toBe('hello world')
  })

  it('returns empty string for empty array', () => {
    expect(extractPlaintext([])).toBe('')
  })

  it('returns empty string for all non-text segments', () => {
    const segments = [Seg.at(123n), Seg.face(1), Seg.reply(10)]
    expect(extractPlaintext(segments)).toBe('')
  })

  it('handles mixed segment array correctly', () => {
    const segments = [Seg.reply(99), Seg.at(111n), Seg.text('nice pic'), Seg.image('img.jpg')]
    expect(extractPlaintext(segments)).toBe('nice pic')
  })
})

describe('MessageBuilder', () => {
  it('builds a message with chained methods', () => {
    const msg = new MessageBuilder().text('Hello ').at(123456n).text(' world!').build()
    expect(msg).toHaveLength(3)
    expect(msg[0]).toEqual({ type: 'text', data: { text: 'Hello ' } })
    expect(msg[1]).toEqual({ type: 'at', data: { qq: '123456' } })
    expect(msg[2]).toEqual({ type: 'text', data: { text: ' world!' } })
  })

  it('build() returns a copy each time', () => {
    const builder = new MessageBuilder().text('test')
    const a = builder.build()
    const b = builder.build()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('supports add() for custom segments', () => {
    const builder = new MessageBuilder()
    builder.add(Seg.face(21))
    const msg = builder.build()
    expect(msg[0]).toEqual({ type: 'face', data: { id: 21 } })
  })

  it('supports image() method', () => {
    const msg = new MessageBuilder().image('test.jpg').build()
    expect(msg[0]?.type).toBe('image')
  })

  it('supports record() method', () => {
    const msg = new MessageBuilder().record('voice.silk').build()
    expect(msg[0]?.type).toBe('record')
  })

  it('supports reply() method', () => {
    const msg = new MessageBuilder().reply(789).build()
    expect(msg[0]).toEqual({ type: 'reply', data: { id: 789 } })
  })
})

describe('buildMentionMessage', () => {
  it('returns plain string for private chat', () => {
    const result = buildMentionMessage('hello', 12345, false)
    expect(result).toBe('hello')
  })

  it('returns segment array with at for group chat', () => {
    const result = buildMentionMessage('hello', 12345, true)
    expect(Array.isArray(result)).toBe(true)
    const arr = result as AtSegment[]
    expect(arr[0]).toEqual({ type: 'at', data: { qq: '12345' } })
    expect(arr[1]).toEqual({ type: 'text', data: { text: ' hello' } })
  })
})
