import { EventEmitter } from 'node:events'

import { describe, it, expect, vi } from 'vitest'

const { debugMock } = vi.hoisted(() => ({ debugMock: vi.fn() }))

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  getLogger: () => ({ debug: debugMock }),
}))

const { openSseConnection } = await import('@/core/utils/index.js')

function makeReply() {
  const headers: Record<string, string> = {}
  const writes: string[] = []
  let ended = false
  return {
    raw: {
      setHeader: (key: string, value: string) => {
        headers[key] = value
      },
      write: (chunk: string) => {
        writes.push(chunk)
        return true
      },
      end: () => {
        ended = true
      },
    },
    _headers: headers,
    _writes: writes,
    get _ended() {
      return ended
    },
  }
}

function makeRequest(url = '/test') {
  const raw = new EventEmitter()
  return { raw, url }
}

describe('openSseConnection', () => {
  it('设置标准 SSE 响应头，并写入初始 connected 事件', () => {
    const reply = makeReply()
    const request = makeRequest()

    openSseConnection(request as never, reply as never)

    expect(reply._headers['Content-Type']).toBe('text/event-stream')
    expect(reply._headers['Cache-Control']).toBe('no-cache')
    expect(reply._headers['X-Accel-Buffering']).toBe('no')
    expect(reply._headers.Connection).toBe('keep-alive')
    expect(reply._writes[0]).toBe('event: connected\ndata: {}\n\n')
    expect(debugMock).toHaveBeenCalledWith({ url: '/test' }, 'SSE 连接建立')
  })

  it('send() 序列化数据并写入 data 事件', () => {
    const reply = makeReply()
    const request = makeRequest()
    const conn = openSseConnection(request as never, reply as never)

    conn.send({ hello: 'world' })

    expect(reply._writes[1]).toBe('data: {"hello":"world"}\n\n')
  })

  it('send() 序列化失败时不抛出，仅记录 debug 日志', () => {
    const reply = makeReply()
    const request = makeRequest()
    const conn = openSseConnection(request as never, reply as never)

    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() => {
      conn.send(circular)
    }).not.toThrow()
    expect(debugMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      'SSE 写入失败，忽略',
    )
  })

  it('waitForClose() 在客户端断开时 resolve，并调用 onClose 回调 + reply.raw.end()', async () => {
    const reply = makeReply()
    const request = makeRequest()
    const onClose = vi.fn()
    const conn = openSseConnection(request as never, reply as never, onClose)

    const waitPromise = conn.waitForClose()
    request.raw.emit('close')
    await waitPromise

    expect(onClose).toHaveBeenCalledOnce()
    expect(reply._ended).toBe(true)
    expect(debugMock).toHaveBeenCalledWith({ url: '/test' }, 'SSE 连接断开')
  })

  it('多次调用 waitForClose() 不应重复注册监听器：close 触发时 onClose/reply.raw.end() 各只执行一次', async () => {
    const reply = makeReply()
    const request = makeRequest()
    const onClose = vi.fn()
    const conn = openSseConnection(request as never, reply as never, onClose)

    const promise1 = conn.waitForClose()
    const promise2 = conn.waitForClose()
    expect(promise1).toBe(promise2)

    request.raw.emit('close')
    await promise1

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(request.raw.listenerCount('close')).toBe(0)
  })
})
