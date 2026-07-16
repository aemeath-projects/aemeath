import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registerErrorHandlers } from '@/core/error-handler.js'
import { AppError, NotFoundError, ForbiddenError, ValidationError } from '@/core/errors.js'

describe('registerErrorHandlers', () => {
  let app: FastifyInstance

  beforeEach(() => {
    app = Fastify({ logger: false })
    registerErrorHandlers(app, { frontendDist: null })
  })

  afterEach(async () => {
    await app.close()
  })

  it('AppError 子类抛出时，返回对应 statusCode 与 fail() 格式', async () => {
    app.get('/api/boom', () => {
      throw new NotFoundError('资源不存在')
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/boom' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ code: -1, data: null, message: '资源不存在' })
  })

  it('ForbiddenError 返回 403', async () => {
    app.get('/api/forbidden', () => {
      throw new ForbiddenError('无权限')
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/forbidden' })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ code: -1, message: '无权限' })
  })

  it('ValidationError 返回 422', async () => {
    app.get('/api/invalid', () => {
      throw new ValidationError('参数错误')
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/invalid' })

    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: -1, message: '参数错误' })
  })

  it('基础 AppError 使用其自定义 statusCode', async () => {
    app.get('/api/custom', () => {
      throw new AppError(-1, '限流', 429)
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/custom' })

    expect(res.statusCode).toBe(429)
    expect(res.json()).toMatchObject({ code: -1, message: '限流' })
  })

  it('未知异常返回 500，不泄漏堆栈信息', async () => {
    app.get('/api/crash', () => {
      throw new Error('内部实现细节，不应泄漏给客户端')
    })
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/crash' })

    expect(res.statusCode).toBe(500)
    const body: { code: number; message: string } = res.json()
    expect(body.code).toBe(-1)
    expect(body.message).toBe('服务器内部错误')
  })

  it('/api/* 未匹配路由返回 JSON 404', async () => {
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ code: -1, data: null, message: 'Not Found' })
  })

  it('非 /api 路径未匹配时，frontendDist 为 null 时返回原始 404', async () => {
    await app.ready()

    const res = await app.inject({ method: 'GET', url: '/some-frontend-route' })

    expect(res.statusCode).toBe(404)
  })
})
