/**
 * Prisma 客户端扩展 —— 慢查询日志。
 */
import { Prisma as AemeathPrisma } from '#prisma/aemeath'

/** 默认慢查询阈值（毫秒）。 */
const DEFAULT_THRESHOLD_MS = 200

/** 日志函数签名，兼容 Pino / console 等。 */
interface SlowQueryLogger {
  warn: (msg: string, ...args: unknown[]) => void
}

/**
 * 为 Prisma Client 添加慢查询日志扩展。
 *
 * @param client - Prisma Client 实例（主库或聊天库均可）
 * @param logger - 日志对象，需实现 warn 方法（默认 console）
 * @param thresholdMs - 慢查询阈值，超过此值记录警告（默认 200ms）
 * @returns 包装后的 Prisma Client（类型与原始 client 一致）
 */
export function withSlowQueryLogging<T extends { $extends: (extension: unknown) => unknown }>(
  client: T,
  logger: SlowQueryLogger = console,
  thresholdMs: number = DEFAULT_THRESHOLD_MS,
): T {
  const extension = AemeathPrisma.defineExtension({
    query: {
      $allOperations: async ({ model, operation, args, query }) => {
        const start = performance.now()
        const result: unknown = await query(args)
        const elapsed = performance.now() - start

        if (elapsed > thresholdMs) {
          logger.warn(
            `[SlowQuery] ${model ?? 'unknown'}.${operation} took ${elapsed.toFixed(1)}ms (threshold: ${String(thresholdMs)}ms)`,
          )
        }

        return result
      },
    },
  })

  return client.$extends(extension) as T
}
