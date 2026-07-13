import type { Context } from '@aemeath-projects/exostrider/dispatch'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import { describe, it, expect, vi } from 'vitest'

const { debugMock } = vi.hoisted(() => {
  return {
    debugMock: vi.fn(),
  }
})

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  getLogger: () => ({ debug: debugMock }),
}))

import type { ContextApis } from '@/core/dispatch/index.js'
import { IrisInterceptor } from '@/core/dispatch/interceptors/iris.js'
import type { IrisService } from '@/core/iris/index.js'

type Ctx = Context<AnyOneBotEvent, ContextApis>

function makeCtx(event: AnyOneBotEvent): Ctx {
  return { event } as unknown as Ctx
}

function makeGroupMessageEvent(overrides: Partial<AnyOneBotEvent> = {}): AnyOneBotEvent {
  return {
    time: 1700000000,
    selfId: 1,
    postType: 'message',
    messageType: 'group',
    subType: 'normal',
    messageId: 123,
    groupId: 456,
    userId: 789,
    message: [{ type: 'text', data: { text: '普通聊天，不触发任何命令' } }],
    rawMessage: '普通聊天，不触发任何命令',
    font: 0,
    sender: { userId: 789, nickname: '张三', role: 'member' },
    ...overrides,
  }
}

describe('IrisInterceptor（dispatch 级拦截器）', () => {
  it('应无条件归档普通消息事件（不依赖是否命中任何业务 handler，preHandle 恒返回 true 放行）', async () => {
    const saveMessage = vi.fn().mockResolvedValue(undefined)
    const irisService = { saveMessage } as unknown as IrisService
    const interceptor = new IrisInterceptor(irisService)

    const result = await interceptor.preHandle(makeCtx(makeGroupMessageEvent()))

    expect(result).toBe(true)
    expect(saveMessage).toHaveBeenCalledOnce()
    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 123n,
        messageType: 2,
        groupId: '456',
        userId: '789',
        rawMessage: '普通聊天，不触发任何命令',
      }),
    )
  })

  it('私聊消息 messageType 应映射为 1 且 groupId 为 undefined', async () => {
    const saveMessage = vi.fn().mockResolvedValue(undefined)
    const irisService = { saveMessage } as unknown as IrisService
    const interceptor = new IrisInterceptor(irisService)

    await interceptor.preHandle(
      makeCtx(makeGroupMessageEvent({ messageType: 'private', groupId: undefined })),
    )

    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 1, groupId: undefined }),
    )
  })

  it('非 message 类型事件应直接忽略，不调用 saveMessage，仍返回 true 放行', async () => {
    const saveMessage = vi.fn()
    const irisService = { saveMessage } as unknown as IrisService
    const interceptor = new IrisInterceptor(irisService)

    const result = await interceptor.preHandle(
      makeCtx({ postType: 'notice', noticeType: 'group_increase' } as unknown as AnyOneBotEvent),
    )

    expect(result).toBe(true)
    expect(saveMessage).not.toHaveBeenCalled()
    expect(debugMock).toHaveBeenCalledWith(
      { postType: 'notice' },
      'IrisInterceptor: 非消息事件，跳过归档',
    )
  })
})
