/**
 * 状态机单元测试（适配 exostrider 新版 API）。
 */

import {
  StateMachine,
  StateMachineError,
  InvalidTransitionError,
  SessionContext,
  type StateDefinition,
} from '@aemeath-projects/exostrider/session'
import { describe, expect, it, vi } from 'vitest'

/* 测试辅助：伪 SessionContext */

function makeContext(_input: string | null = null): SessionContext {
  return new SessionContext(
    {},
    {
      reply: vi.fn().mockResolvedValue(undefined),
    },
  )
}

/* 基础状态机创建 */

describe('StateMachine 创建', () => {
  it('应正确设置初始状态', () => {
    const states: StateDefinition[] = [{ id: 'step1' }, { id: 'step2' }]
    const sm = new StateMachine(states)
    expect(sm.getCurrentState()).toBeNull()
    expect(sm.isFinished).toBe(false)
  })

  it('空状态列表不抛出', () => {
    expect(() => new StateMachine([])).not.toThrow()
  })
})

/* start */

describe('StateMachine.start', () => {
  it('应进入初始状态并调用 onEnter', async () => {
    const onEnter = vi.fn().mockResolvedValue(undefined)
    const states: StateDefinition[] = [{ id: 'init', onEnter }]
    const sm = new StateMachine(states)
    const ctx = makeContext()
    await sm.start(ctx, 'init')
    expect(sm.getCurrentState()).toBe('init')
    expect(onEnter).toHaveBeenCalledOnce()
    expect(onEnter).toHaveBeenCalledWith(ctx)
  })

  it('初始状态未设置时应抛出 StateMachineError', async () => {
    const sm = new StateMachine([])
    const ctx = makeContext()
    await expect(sm.start(ctx, 'nonexistent')).rejects.toBeInstanceOf(StateMachineError)
  })
})

/* 状态转换 */

describe('StateMachine.transitionTo', () => {
  it('应转换到目标状态并调用 onExit 和 onEnter', async () => {
    const onExit = vi.fn().mockResolvedValue(undefined)
    const onEnterB = vi.fn().mockResolvedValue(undefined)
    const states: StateDefinition[] = [
      { id: 'a', onExit },
      { id: 'b', onEnter: onEnterB },
    ]
    const sm = new StateMachine(states)
    const ctx = makeContext()
    await sm.start(ctx, 'a')
    await sm.transitionTo(ctx, 'b')
    expect(sm.getCurrentState()).toBe('b')
    expect(onExit).toHaveBeenCalledOnce()
    expect(onEnterB).toHaveBeenCalledOnce()
  })

  it('目标状态不存在时应抛出 InvalidTransitionError', async () => {
    const states: StateDefinition[] = [{ id: 'a' }]
    const sm = new StateMachine(states)
    const ctx = makeContext()
    await sm.start(ctx, 'a')
    await expect(sm.transitionTo(ctx, 'nonexistent')).rejects.toBeInstanceOf(InvalidTransitionError)
  })
})

/* processInput */

describe('StateMachine.processInput', () => {
  it('使用 onInput 处理输入并转换状态', async () => {
    const onEnterB = vi.fn().mockResolvedValue(undefined)
    const states: StateDefinition[] = [
      {
        id: 'a',
        onInput: async (_ctx, _input) => ({ nextState: 'b' }),
      },
      { id: 'b', onEnter: onEnterB },
    ]
    const sm = new StateMachine(states)
    const ctx = makeContext('hello')
    await sm.start(ctx, 'a')
    const result = await sm.processInput(ctx, 'hello')
    expect(result.nextState).toBe('b')
    expect(sm.getCurrentState()).toBe('b')
    expect(onEnterB).toHaveBeenCalledOnce()
  })

  it('onInput 返回空 nextState 时应停留当前状态', async () => {
    const states: StateDefinition[] = [
      {
        id: 'a',
        onInput: async (_ctx, _input) => ({}),
      },
    ]
    const sm = new StateMachine(states)
    const ctx = makeContext('anything')
    await sm.start(ctx, 'a')
    const result = await sm.processInput(ctx, 'anything')
    expect(result.nextState).toBeUndefined()
    expect(sm.getCurrentState()).toBe('a')
  })

  it('返回 finished=true 时 isFinished 应为 true', async () => {
    const states: StateDefinition[] = [
      {
        id: 'start',
        onInput: async (_ctx, _input) => ({ finished: true }),
      },
    ]
    const sm = new StateMachine(states)
    const ctx = makeContext()
    await sm.start(ctx, 'start')
    await sm.processInput(ctx, 'anything')
    expect(sm.isFinished).toBe(true)
  })

  it('状态机未启动时应抛出 StateMachineError', async () => {
    const states: StateDefinition[] = [{ id: 'a' }]
    const sm = new StateMachine(states)
    const ctx = makeContext()
    await expect(sm.processInput(ctx, 'input')).rejects.toBeInstanceOf(StateMachineError)
  })
})

/* isFinished */

describe('StateMachine.isFinished', () => {
  it('到达 finished 后 isFinished 应为 true', async () => {
    const states: StateDefinition[] = [
      {
        id: 'start',
        onInput: async (_ctx, _input) => ({ finished: true }),
      },
    ]
    const sm = new StateMachine(states)
    const ctx = makeContext('anything')
    await sm.start(ctx, 'start')
    expect(sm.isFinished).toBe(false)
    await sm.processInput(ctx, 'anything')
    expect(sm.isFinished).toBe(true)
  })

  it('初始状态未 finish 时 isFinished 应为 false', async () => {
    const states: StateDefinition[] = [{ id: 'start' }]
    const sm = new StateMachine(states)
    const ctx = makeContext()
    await sm.start(ctx, 'start')
    expect(sm.isFinished).toBe(false)
  })
})
