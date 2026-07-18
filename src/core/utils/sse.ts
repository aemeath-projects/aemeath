/**
 * SSE（Server-Sent Events）连接生命周期共享辅助。
 *
 * 统一响应头设置、事件写入、连接建立/断开的调试日志与清理逻辑，
 * 供 logs.ts / accounts.ts / mailbox/api.ts 三处 SSE 端点复用。
 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { FastifyReply, FastifyRequest } from 'fastify'

const log: PinoLogger = getLogger('sse') as unknown as PinoLogger

/** SSE 连接句柄。 */
export interface SseConnection {
  /** 序列化并写入一条 SSE data 事件；序列化/写入失败仅记录 debug 日志，不抛出。 */
  send(data: unknown): void
  /** 返回一个在客户端断开连接时 resolve 的 Promise，同时执行清理逻辑。 */
  waitForClose(): Promise<void>
}

/**
 * 打开一个 SSE 连接：设置标准响应头、写入初始 `connected` 事件、记录建立日志。
 *
 * @param request - Fastify 请求对象，用于监听客户端断开
 * @param reply - Fastify 响应对象，用于写入 SSE 数据与结束响应
 * @param onClose - 客户端断开时的额外清理回调（如移除 EventEmitter 监听器）
 */
export function openSseConnection(
  request: FastifyRequest,
  reply: FastifyReply,
  onClose?: () => void,
): SseConnection {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('X-Accel-Buffering', 'no')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.write('event: connected\ndata: {}\n\n')
  log.debug({ url: request.url }, 'SSE 连接建立')

  const send = (data: unknown): void => {
    try {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch (err) {
      log.debug({ err }, 'SSE 写入失败，忽略')
    }
  }

  // 用同一个 Promise 缓存，确保重复调用 waitForClose() 不会重复注册 'close' 监听器、
  // 不会让 onClose()/reply.raw.end() 被多次执行。
  let closePromise: Promise<void> | undefined
  const waitForClose = (): Promise<void> => {
    closePromise ??= new Promise<void>((resolve) => {
      request.raw.once('close', () => {
        onClose?.()
        reply.raw.end()
        log.debug({ url: request.url }, 'SSE 连接断开')
        resolve()
      })
    })
    return closePromise
  }

  return { send, waitForClose }
}
