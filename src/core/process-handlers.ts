/**
 * 进程级异常兜底 —— 注册 uncaughtException/unhandledRejection 处理器。
 *
 * main.ts（Fastify 主进程）与 worker.ts（BullMQ Worker 进程）各自在启动早期
 * 调用一次 registerProcessErrorHandlers()，抽成独立函数便于单测覆盖。
 */
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

/** 仅使用到的 logger 方法子集，避免强依赖完整 PinoLogger 类型（便于测试用简单对象 mock）。 */
export interface ProcessErrorLogger {
  fatal: PinoLogger['fatal']
  error: PinoLogger['error']
}

/**
 * 注册进程级异常兜底处理器。
 *
 * - `uncaughtException`：进程状态已不可信（遵循 Node.js 官方建议），记录 fatal 日志后强制退出。
 * - `unhandledRejection`：仅记录 error 日志，不强制退出（避免因偶发的未处理 rejection
 *   打断整个长期运行的进程）。
 */
export function registerProcessErrorHandlers(logger: ProcessErrorLogger): void {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '未捕获异常，进程即将退出')
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, '未处理的 Promise rejection')
  })
}
