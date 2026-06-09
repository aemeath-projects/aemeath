import { describe, expect, it, vi } from 'vitest'

import { BotAPI } from '@/core/protocol/api.js'
import type { APIResponse } from '@/core/protocol/models/api.js'

/** 创建一个 BotAPI 实例，同时捕获所有通过 send 发出的字符串。 */
function makeBotAPI(): { api: BotAPI; sent: string[] } {
  const sent: string[] = []
  const api = new BotAPI((data) => sent.push(data))
  return { api, sent }
}

/** 从已发送列表中安全取值并解析 JSON。 */
function parseSent(sent: string[], index: number): Record<string, unknown> {
  const raw = sent[index]
  expect(raw).toBeDefined()
  return JSON.parse(raw ?? '') as Record<string, unknown>
}

describe('BotAPI', () => {
  describe('sendGroupMsg', () => {
    it('应当通过 send 回调发送包含 echo 字段的 JSON', async () => {
      const { api, sent } = makeBotAPI()

      // 启动调用，不等待（否则会超时）
      const promise = api.sendGroupMsg(12345, [{ type: 'text', data: { text: 'hello' } }])

      // 断言已发送一条消息
      expect(sent).toHaveLength(1)
      const payload = parseSent(sent, 0)
      expect(payload.action).toBe('send_group_msg')
      expect(typeof payload.echo).toBe('string')
      expect((payload.echo as string).length).toBeGreaterThan(0)
      expect((payload.params as Record<string, unknown>).group_id).toBe(12345)

      // 用正确的 echo 模拟响应，使 promise 解析
      const response: APIResponse = {
        status: 'ok',
        retcode: 0,
        data: { message_id: 999 },
        echo: payload.echo as string,
      }
      api.handleResponse(response)

      const result = await promise
      expect(result.status).toBe('ok')
      expect(result.data).toEqual({ message_id: 999 })
    })
  })

  describe('handleResponse', () => {
    it('matching echo 应当解析对应的 Promise', async () => {
      const { api, sent } = makeBotAPI()

      const promise = api.sendPrivateMsg(54321, 'hi')

      expect(sent).toHaveLength(1)
      const payload = parseSent(sent, 0)
      const echo = payload.echo as string

      const response: APIResponse = {
        status: 'ok',
        retcode: 0,
        data: { message_id: 42 },
        echo,
      }
      api.handleResponse(response)

      const result = await promise
      expect(result.echo).toBe(echo)
      expect(result.retcode).toBe(0)
    })

    it('未知 echo 应当被静默忽略', () => {
      const { api } = makeBotAPI()

      expect(() => {
        api.handleResponse({
          status: 'ok',
          retcode: 0,
          data: null,
          echo: 'nonexistent-echo-id',
        })
      }).not.toThrow()
    })
  })

  describe('超时处理', () => {
    it('超过 timeoutMs 后应当 reject Promise', async () => {
      const sent: string[] = []
      // 使用极短超时以加速测试
      const api = new BotAPI((data) => sent.push(data))

      await expect(
        (
          api as unknown as {
            call: (
              action: string,
              params: Record<string, unknown>,
              timeoutMs: number,
            ) => Promise<APIResponse>
          }
        ).call('get_status', {}, 10),
      ).rejects.toThrow(/超时|timeout/i)
    })

    it('超时后不应影响后续调用', async () => {
      vi.useFakeTimers()
      const { api, sent } = makeBotAPI()

      // 第一个调用（会超时）
      const p1 = (
        api as unknown as {
          call: (
            action: string,
            params: Record<string, unknown>,
            timeoutMs: number,
          ) => Promise<APIResponse>
        }
      ).call('get_status', {}, 50)

      // 推进时间使其超时
      vi.advanceTimersByTime(100)
      await expect(p1).rejects.toThrow()

      // 第二个调用应当正常工作
      const p2 = api.getLoginInfo()
      expect(sent.length).toBeGreaterThanOrEqual(2)
      const payload2 = parseSent(sent, sent.length - 1)
      const echo2 = payload2.echo as string

      api.handleResponse({ status: 'ok', retcode: 0, data: null, echo: echo2 })
      const result = await p2
      expect(result.status).toBe('ok')

      vi.useRealTimers()
    })
  })

  describe('API 方法', () => {
    it('deleteMsg 应当发送正确的 action 和参数', async () => {
      const { api, sent } = makeBotAPI()

      const promise = api.deleteMsg(777)
      const payload = parseSent(sent, 0)

      expect(payload.action).toBe('delete_msg')
      expect((payload.params as Record<string, unknown>).message_id).toBe(777)

      api.handleResponse({ status: 'ok', retcode: 0, data: null, echo: payload.echo as string })
      await promise
    })

    it('setGroupBan 应当使用默认 duration', async () => {
      const { api, sent } = makeBotAPI()

      const promise = api.setGroupBan(111, 222)
      const payload = parseSent(sent, 0)
      const params = payload.params as Record<string, unknown>

      expect(payload.action).toBe('set_group_ban')
      expect(params.group_id).toBe(111)
      expect(params.user_id).toBe(222)
      expect(params.duration).toBe(1800)

      api.handleResponse({ status: 'ok', retcode: 0, data: null, echo: payload.echo as string })
      await promise
    })
  })
})
