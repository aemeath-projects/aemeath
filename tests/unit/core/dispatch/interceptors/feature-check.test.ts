import type { ResolvedHandler } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect, vi } from 'vitest'

import type { OneBotContext } from '@/core/dispatch/context.js'
import { FeatureCheckInterceptor } from '@/core/dispatch/interceptors/feature-check.js'
import type { FeatureChecker } from '@/core/dispatch/interceptors/feature-check.js'

function makeHandler(): ResolvedHandler {
  return {
    instance: {},
    methodName: 'handle',
    handlerName: 'test',
    priority: 0,
    requiredBotCapability: null,
  }
}

describe('FeatureCheckInterceptor', () => {
  it('未注入 checker 时直通返回 true', async () => {
    const interceptor = new FeatureCheckInterceptor()
    const ctx = {} as unknown as OneBotContext

    const result = await interceptor.preHandle(ctx, makeHandler())

    expect(result).toBe(true)
  })

  it('注入 checker 后委托 checker.check 的返回值', async () => {
    const interceptor = new FeatureCheckInterceptor()
    const check = vi.fn().mockResolvedValue(false)
    const checker: FeatureChecker = { check }
    interceptor.setChecker(checker)
    const ctx = {} as unknown as OneBotContext

    const result = await interceptor.preHandle(ctx, makeHandler())

    expect(result).toBe(false)
    expect(check).toHaveBeenCalledWith(ctx)
  })

  it('checker.check 返回 true 时放行', async () => {
    const interceptor = new FeatureCheckInterceptor()
    const checker: FeatureChecker = { check: vi.fn().mockResolvedValue(true) }
    interceptor.setChecker(checker)
    const ctx = {} as unknown as OneBotContext

    const result = await interceptor.preHandle(ctx, makeHandler())

    expect(result).toBe(true)
  })
})
