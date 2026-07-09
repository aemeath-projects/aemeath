import type { ResolvedHandler } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { GroupBotRegistry } from '../../../../../src/core/accounts/group-bot-registry.js'
import type { OneBotContext } from '../../../../../src/core/dispatch/context.js'
import { CapabilityInterceptor } from '../../../../../src/core/dispatch/interceptors/capability.js'

function makeCtx(groupId: string | undefined, replySpy: ReturnType<typeof vi.fn>) {
  const apis = {
    msgApi: {},
    friendApi: {},
    groupApi: { id: 'original' },
  }
  return {
    groupId,
    apis,
    reply: replySpy,
  } as unknown as OneBotContext
}

function makeHandler(capability: 'group_admin' | 'group_owner' | null): ResolvedHandler {
  return {
    instance: {},
    methodName: 'handle',
    handlerName: 'test',
    priority: 0,
    requiredBotCapability: capability,
  }
}

describe('CapabilityInterceptor', () => {
  let registry: GroupBotRegistry
  let pool: { getClient: ReturnType<typeof vi.fn> }
  let interceptor: CapabilityInterceptor

  beforeEach(() => {
    registry = new GroupBotRegistry()
    pool = { getClient: vi.fn() }
    interceptor = new CapabilityInterceptor(registry, pool as never)
  })

  it('无能力要求时直通返回 true', async () => {
    const ctx = makeCtx('100', vi.fn())
    const result = await interceptor.preHandle(ctx, makeHandler(null))
    expect(result).toBe(true)
  })

  it('非群聊事件（groupId undefined）直通返回 true', async () => {
    const ctx = makeCtx(undefined, vi.fn())
    const result = await interceptor.preHandle(ctx, makeHandler('group_admin'))
    expect(result).toBe(true)
  })

  it('找到有能力的账号时替换 groupApi 并返回 true', async () => {
    registry.setRole('100', 'client-B', 'admin')
    const mockClient = { state: 'connected', client: { id: 'napcat-B' } }
    pool.getClient.mockReturnValue(mockClient)

    const ctx = makeCtx('100', vi.fn())
    const result = await interceptor.preHandle(ctx, makeHandler('group_admin'))

    expect(result).toBe(true)
    // groupApi 应已被替换为新实例（不再是原始 { id: 'original' }）
    expect(ctx.apis.groupApi).not.toEqual({ id: 'original' })
  })

  it('无可用能力账号时回复错误并返回 false', async () => {
    // 群内无任何账号
    const replySpy = vi.fn()
    const ctx = makeCtx('100', replySpy)

    const result = await interceptor.preHandle(ctx, makeHandler('group_admin'))

    expect(result).toBe(false)
    expect(replySpy).toHaveBeenCalledWith('操作失败：群内没有具备所需权限的账号')
  })

  it('有能力账号但已断线时返回 false', async () => {
    registry.setRole('100', 'client-B', 'admin')
    const mockClient = { state: 'disconnected', client: {} }
    pool.getClient.mockReturnValue(mockClient)

    const replySpy = vi.fn()
    const ctx = makeCtx('100', replySpy)

    const result = await interceptor.preHandle(ctx, makeHandler('group_admin'))

    expect(result).toBe(false)
    expect(replySpy).toHaveBeenCalledWith('操作失败：群内没有具备所需权限的账号')
  })
})
