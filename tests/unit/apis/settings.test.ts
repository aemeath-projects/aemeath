/**
 * settings API 路由回归测试 —— 验证移除内联 catch 后由全局 errorHandler 接管状态码。
 */
import { ServiceRegistry } from '@aemeath-projects/exostrider/lifecycle'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { permissionRoutes } from '@/apis/settings.js'
import { registerErrorHandlers } from '@/core/error-handler.js'
import { ValidationError } from '@/core/errors.js'
import type { AemeathServiceMap } from '@/core/lifecycle.js'
import type { SettingsService } from '@/core/settings/index.js'

describe('POST /api/settings/values/:key', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })
    registerErrorHandlers(app, { frontendDist: null })

    const registry = new ServiceRegistry<AemeathServiceMap>()
    const settingsMock = {
      set: vi.fn().mockRejectedValue(new ValidationError('未知配置项')),
    } as unknown as SettingsService
    registry.set('settings', settingsMock)
    app.decorate('services', registry)

    await app.register(permissionRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('setter 抛出 ValidationError 时应当返回 422（而不是旧行为的 400）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/values/unknown.key',
      payload: { value: 'x' },
    })

    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: -1 })
  })
})
