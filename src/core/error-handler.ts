/**
 * 全局 Fastify 错误处理器与 404 处理器 —— 统一响应格式为 ok()/fail()。
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { FastifyInstance } from 'fastify'

import { AppError } from './errors.js'
import { fail } from './schemas/index.js'

export interface ErrorHandlerOptions {
  /** 前端静态文件目录（用于非 /api 路径的 SPA fallback）；无前端时传 null。 */
  frontendDist: string | null
}

/** 判断是否携带 Fastify schema 校验错误（`err.validation` 存在）。 */
function hasValidationError(err: unknown): err is { message: string; validation: unknown } {
  return typeof err === 'object' && err !== null && 'validation' in err
}

/**
 * 注册全局错误处理器与按路径分支的 404 处理器。
 *
 * - `AppError`（含子类）→ 按其 statusCode 返回，message 走 fail()
 * - Fastify 自身的 schema 校验错误 → 视为 422
 * - 其余未知异常 → 记录日志，返回 500 通用错误，不泄漏堆栈
 * - `/api/*` 未匹配路由 → JSON 404；其余路径 → SPA index.html fallback（无前端时走 Fastify 默认 404）
 */
export function registerErrorHandlers(app: FastifyInstance, options: ErrorHandlerOptions): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      void reply.status(err.statusCode).send(fail(err.message))
      return
    }
    if (hasValidationError(err)) {
      void reply.status(422).send(fail(err.message))
      return
    }
    req.log.error({ err }, '未捕获异常')
    void reply.status(500).send(fail('服务器内部错误'))
  })

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      await reply.status(404).send(fail('Not Found'))
      return
    }

    if (options.frontendDist !== null) {
      const indexPath = resolve(options.frontendDist, 'index.html')
      if (existsSync(indexPath)) {
        await reply.sendFile('index.html', options.frontendDist)
        return
      }
    }

    await reply.status(404).send({ error: 'Not Found' })
  })
}
