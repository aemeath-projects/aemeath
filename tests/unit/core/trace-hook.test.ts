import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { enterTraceMock } = vi.hoisted(() => ({ enterTraceMock: vi.fn() }))

vi.mock('@aemeath-projects/exostrider/logger', () => ({
  enterTrace: enterTraceMock,
}))

const { registerTraceHook } = await import('@/core/trace-hook.js')

describe('registerTraceHook', () => {
  let app: FastifyInstance

  beforeEach(() => {
    enterTraceMock.mockClear()
    app = Fastify({ logger: false })
    registerTraceHook(app)
    app.get('/ping', () => ({ ok: true }))
  })

  afterEach(async () => {
    await app.close()
  })

  it('每个请求都调用 enterTrace(req.id)', async () => {
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/ping' })

    expect(res.statusCode).toBe(200)
    expect(enterTraceMock).toHaveBeenCalledOnce()
    expect(enterTraceMock).toHaveBeenCalledWith(expect.any(String))
  })

  it('响应头附加 X-Trace-Id，值与 Fastify req.id 一致', async () => {
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/ping' })

    expect(res.headers['x-trace-id']).toBeDefined()
    expect(typeof res.headers['x-trace-id']).toBe('string')
  })
})
