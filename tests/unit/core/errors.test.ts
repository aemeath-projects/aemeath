import { describe, expect, it } from 'vitest'

import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BotApiError,
  ConflictError,
  UnauthorizedError,
} from '@/core/errors.js'

describe('AppError 及其子类', () => {
  it('NotFoundError 的 statusCode 为 404，code 为 -1', () => {
    const err = new NotFoundError('未找到')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe(-1)
    expect(err).toBeInstanceOf(AppError)
  })

  it('ForbiddenError 的 statusCode 为 403', () => {
    expect(new ForbiddenError('无权限').statusCode).toBe(403)
  })

  it('ValidationError 的 statusCode 为 422', () => {
    expect(new ValidationError('参数错误').statusCode).toBe(422)
  })

  it('BotApiError 继承 AppError，statusCode 固定为 502，保留 retcode', () => {
    const err = new BotApiError(1200, 'API 调用失败')
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(502)
    expect(err.code).toBe(-1)
    expect(err.retcode).toBe(1200)
    expect(err.message).toBe('API 调用失败')
    expect(err.name).toBe('BotApiError')
  })

  it('ConflictError 的 statusCode 为 409，code 为 -1', () => {
    const err = new ConflictError('资源冲突')
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe(-1)
    expect(err).toBeInstanceOf(AppError)
    expect(err.name).toBe('ConflictError')
  })

  it('UnauthorizedError 的 statusCode 为 401，code 为 -1', () => {
    const err = new UnauthorizedError('未认证')
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe(-1)
    expect(err).toBeInstanceOf(AppError)
    expect(err.name).toBe('UnauthorizedError')
  })
})
