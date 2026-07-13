import type { ResolvedHandler } from '@aemeath-projects/exostrider/dispatch'
import { describe, it, expect } from 'vitest'

import { MetricsInterceptor } from '@/core/dispatch/interceptors/metrics.js'

function makeHandler(): ResolvedHandler {
  return {
    instance: {},
    methodName: 'handle',
    handlerName: 'echo',
    priority: 0,
    requiredBotCapability: null,
  }
}

describe('MetricsInterceptor（占位实现，Phase 6 接入 prom-client）', () => {
  it('preHandle 记录开始时间并返回 true', async () => {
    const interceptor = new MetricsInterceptor()
    const attrs = new Map<string, unknown>()
    const ctx = {
      setAttribute: (k: string, v: unknown) => attrs.set(k, v),
      getAttribute: (k: string) => attrs.get(k),
    }

    const result = await interceptor.preHandle(ctx as never, makeHandler())

    expect(result).toBe(true)
    expect(attrs.get('_metrics_start_time')).toEqual(expect.any(Number))
  })

  it('postHandle 与 afterCompletion 均为占位实现，调用不抛出异常', async () => {
    const interceptor = new MetricsInterceptor()
    const ctx = {}

    await expect(interceptor.postHandle(ctx as never, makeHandler())).resolves.toBeUndefined()
    await expect(
      interceptor.afterCompletion(ctx as never, makeHandler(), undefined),
    ).resolves.toBeUndefined()
  })
})
