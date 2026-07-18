/**
 * HTTP 链路 trace 接入 —— 复用 Fastify 内置 req.id 作为 traceId。
 */
import { enterTrace } from '@aemeath-projects/exostrider/logger'
import type { FastifyInstance } from 'fastify'

/**
 * 注册 `onRequest` 钩子：调用 `enterTrace(req.id)` 使本次请求生命周期内的所有
 * 日志自动携带 traceId，并在响应头附加 `X-Trace-Id` 便于前端对齐服务端日志。
 */
export function registerTraceHook(app: FastifyInstance): void {
  app.addHook('onRequest', (req, reply, done) => {
    enterTrace(req.id)
    void reply.header('X-Trace-Id', req.id)
    done()
  })
}
