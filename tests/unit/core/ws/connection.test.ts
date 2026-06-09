import { describe, expect, it, vi } from 'vitest'

import { BotAPI } from '@/core/protocol/api.js'
import type { APIResponse } from '@/core/protocol/models/api.js'
import type { AnyOneBotEvent } from '@/core/protocol/models/events.js'
import { ConnectionManager } from '@/core/ws/connection.js'
import type { MinimalSocket } from '@/core/ws/connection.js'

/** 模拟 WebSocket 套接字。 */
function makeMockSocket() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}

  const socket = {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    send: vi.fn((_data: string): void => {}),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    close: vi.fn((_code?: number, _reason?: string): void => {}),
    on(event: string, cb: (...args: unknown[]) => void) {
      listeners[event] ??= []
      listeners[event].push(cb)
      return socket as unknown as MinimalSocket
    },
    /** 触发已注册的事件监听器。 */
    emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) {
        cb(...args)
      }
    },
  }

  return socket
}

/** 创建测试用的 ConnectionManager，捕获事件回调触发情况。 */
function makeConnMgr() {
  const events: AnyOneBotEvent[] = []
  const apiResponses: APIResponse[] = []

  // 创建一个 BotAPI，捕获 handleResponse 的调用
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const api = new BotAPI((_data: string): void => {})
  // 在 spy 之前保存原始方法，避免循环调用
  const originalHandleResponse = api.handleResponse.bind(api)
  const spy = vi.spyOn(api, 'handleResponse').mockImplementation((resp) => {
    apiResponses.push(resp)
    originalHandleResponse(resp)
  })

  const connMgr = new ConnectionManager(api, (ev) => events.push(ev))
  return { connMgr, api, spy, events, apiResponses }
}

describe('ConnectionManager', () => {
  describe('isConnected 状态转换', () => {
    it('初始状态应为 false', () => {
      const { connMgr } = makeConnMgr()
      expect(connMgr.isConnected).toBe(false)
    })

    it('handleConnect 后 isConnected 应为 true', () => {
      const { connMgr } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)
      expect(connMgr.isConnected).toBe(true)
    })

    it('handleDisconnect 后 isConnected 应为 false', () => {
      const { connMgr } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)
      connMgr.handleDisconnect()
      expect(connMgr.isConnected).toBe(false)
    })

    it('socket close 事件应触发断线处理', () => {
      const { connMgr } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)
      expect(connMgr.isConnected).toBe(true)
      socket.emit('close')
      expect(connMgr.isConnected).toBe(false)
    })

    it('connectedAt 应在连接时记录时间，断线后清除', () => {
      const { connMgr } = makeConnMgr()
      expect(connMgr.connectedAt).toBeUndefined()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)
      expect(connMgr.connectedAt).toBeInstanceOf(Date)
      connMgr.handleDisconnect()
      expect(connMgr.connectedAt).toBeUndefined()
    })
  })

  describe('消息路由', () => {
    it('含 echo 且无 post_type 的消息应路由至 botApi.handleResponse', () => {
      const { connMgr, spy, apiResponses } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)

      const response: APIResponse = {
        status: 'ok',
        retcode: 0,
        data: null,
        echo: 'test-echo-123',
      }
      socket.emit('message', JSON.stringify(response))

      expect(spy).toHaveBeenCalledOnce()
      expect(apiResponses).toHaveLength(1)
      const first = apiResponses[0]
      expect(first?.echo).toBe('test-echo-123')
    })

    it('含 post_type 的消息应路由至 onEvent 回调', () => {
      const { connMgr, events } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)

      const event = {
        time: 1700000000,
        self_id: 10000,
        post_type: 'message',
        message_type: 'group',
        group_id: 99999,
        user_id: 11111,
        message: [],
        raw_message: '',
        font: 0,
        sub_type: 'normal',
        message_id: 1,
        sender: {},
      }
      socket.emit('message', JSON.stringify(event))

      expect(events).toHaveLength(1)
      expect(events[0]?.post_type).toBe('message')
    })

    it('无 echo 的消息（心跳等）应路由至 onEvent 回调', () => {
      const { connMgr, events } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)

      const heartbeat = {
        time: 1700000001,
        self_id: 10000,
        post_type: 'meta_event',
        meta_event_type: 'heartbeat',
        status: { online: true, good: true },
        interval: 30000,
      }
      socket.emit('message', JSON.stringify(heartbeat))

      expect(events).toHaveLength(1)
      expect((events[0] as { post_type: string } | undefined)?.post_type).toBe('meta_event')
    })

    it('含 echo 和 post_type 的消息应路由至 onEvent（NapCat 特殊事件）', () => {
      const { connMgr, events, spy } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)

      // 含 echo 但也含 post_type 的消息视为事件
      const mixed = {
        time: 1700000002,
        self_id: 10000,
        post_type: 'meta_event',
        meta_event_type: 'lifecycle',
        sub_type: 'connect',
        echo: 'some-echo',
      }
      socket.emit('message', JSON.stringify(mixed))

      // post_type 存在，应路由至事件，而非 API 响应
      expect(events).toHaveLength(1)
      expect(spy).not.toHaveBeenCalled()
    })

    it('无效 JSON 应当被静默忽略', () => {
      const { connMgr, events, spy } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)

      socket.emit('message', 'not valid json {{{')

      expect(events).toHaveLength(0)
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('send', () => {
    it('有连接时应调用 socket.send', () => {
      const { connMgr } = makeConnMgr()
      const socket = makeMockSocket()
      connMgr.handleConnect(socket, {} as never)

      connMgr.send('{"test":true}')

      expect(socket.send).toHaveBeenCalledWith('{"test":true}')
    })

    it('无连接时应抛出错误', () => {
      const { connMgr } = makeConnMgr()
      expect(() => {
        connMgr.send('data')
      }).toThrow()
    })
  })
})
