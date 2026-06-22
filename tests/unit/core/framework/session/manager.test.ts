/**
 * SessionManager 单元测试（适配 exostrider 新版 API）。
 */

import {
  SessionManager,
  InteractiveSession,
  InMemoryLockProvider,
  type StateDefinition,
  type SessionContext,
} from '@aemeath-projects/exostrider/session'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Mock Context */

interface SimpleCtx {
  userId: number
  groupId?: number
  reply: (content: unknown) => Promise<void>
}

function makeMockCtx(userId = 12345, groupId?: number): SimpleCtx {
  return {
    userId,
    groupId,
    reply: vi.fn().mockResolvedValue(undefined),
  }
}

/* 简单的测试会话 */

class SimpleSession extends InteractiveSession<void, SimpleCtx> {
  override buildStates(): StateDefinition<SimpleCtx>[] {
    return [
      {
        id: 'ask',
        onEnter: async (ctx: SessionContext<SimpleCtx>): Promise<void> => {
          await ctx.reply('请输入内容')
        },
        onInput: async (_ctx: SessionContext<SimpleCtx>, _input: string) => {
          return { finished: true }
        },
      },
    ]
  }
}

/** 构建 SessionManager，使用内存锁提供者 */
function makeManager(timeout = 300): {
  manager: SessionManager<SimpleCtx>
  lockProvider: InMemoryLockProvider
} {
  const lockProvider = new InMemoryLockProvider()
  const manager = new SessionManager<SimpleCtx>({
    config: { sessionTimeout: timeout },
    lockProvider,
    keyExtractor: (ctx) => {
      const groupPart = ctx.groupId !== undefined ? String(ctx.groupId) : 'private'
      return `user:${String(ctx.userId)}:source:${groupPart}`
    },
  })
  return { manager, lockProvider }
}

/* SessionManager 基础测试 */

describe('SessionManager.getActiveCount', () => {
  it('初始活跃数为 0', () => {
    const { manager } = makeManager()
    expect(manager.getActiveCount()).toBe(0)
  })
})

describe('SessionManager.isActive', () => {
  it('无活跃会话时应返回 false', () => {
    const { manager } = makeManager()
    expect(manager.isActive('user:12345:source:private')).toBe(false)
  })
})

/* startSession */

describe('SessionManager.start', () => {
  let manager: SessionManager<SimpleCtx>

  beforeEach(() => {
    ;({ manager } = makeManager())
  })

  it('应成功启动会话', async () => {
    const ctx = makeMockCtx(12345, 99999)
    const session = new SimpleSession()
    await manager.start(session, ctx, ctx.reply)
    expect(manager.getActiveCount()).toBe(1)
  })

  it('同一用户同一来源重复启动应不会增加 2 个会话', async () => {
    const ctx = makeMockCtx(12345, 99999)
    const s1 = new SimpleSession()
    const s2 = new SimpleSession()
    await manager.start(s1, ctx, ctx.reply)
    // 重复 start 时应该不能再开启
    await manager.start(s2, ctx, ctx.reply)
    // 只有一个会话（锁保护）
    expect(manager.getActiveCount()).toBeLessThanOrEqual(1)
  })

  it('不同群的同一用户应允许各自的会话', async () => {
    const ctx1 = makeMockCtx(12345, 11111)
    const ctx2 = makeMockCtx(12345, 22222)
    const s1 = new SimpleSession()
    const s2 = new SimpleSession()
    await manager.start(s1, ctx1, ctx1.reply)
    await manager.start(s2, ctx2, ctx2.reply)
    expect(manager.getActiveCount()).toBe(2)
  })
})

/* processMessage */

describe('SessionManager.processMessage', () => {
  it('应将输入路由到活跃会话', async () => {
    const { manager } = makeManager()
    const ctx = makeMockCtx(12345, 99999)
    const session = new SimpleSession()
    await manager.start(session, ctx, ctx.reply)

    const dispatched = await manager.processMessage(ctx, 'hello')
    expect(dispatched).toBe(true)
  })

  it('无活跃会话应返回 false', async () => {
    const { manager } = makeManager()
    const ctx = makeMockCtx()
    const result = await manager.processMessage(ctx, 'hello')
    expect(result).toBe(false)
  })

  it('会话完成后应自动清理', async () => {
    const { manager } = makeManager()
    const ctx = makeMockCtx(12345, 99999)
    const session = new SimpleSession()
    await manager.start(session, ctx, ctx.reply)

    await manager.processMessage(ctx, 'anything')
    // 到达 finished 状态后，会话应被清理
    expect(manager.getActiveCount()).toBe(0)
  })
})

/* cancel */

describe('SessionManager.cancel', () => {
  it('应取消会话', async () => {
    const { manager } = makeManager()
    const ctx = makeMockCtx(12345, 99999)
    const session = new SimpleSession()
    await manager.start(session, ctx, ctx.reply)
    expect(manager.getActiveCount()).toBe(1)

    const key = `user:${String(ctx.userId)}:source:${String(ctx.groupId)}`
    await manager.cancel(key)
    expect(manager.getActiveCount()).toBe(0)
  })
})

/* cancelAll */

describe('SessionManager.cancelAll', () => {
  it('应取消所有活跃会话', async () => {
    const { manager } = makeManager()
    await manager.start(new SimpleSession(), makeMockCtx(1, 1))
    await manager.start(new SimpleSession(), makeMockCtx(2, 2))
    expect(manager.getActiveCount()).toBe(2)
    await manager.cancelAll()
    expect(manager.getActiveCount()).toBe(0)
  })
})
