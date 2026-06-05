/**
 * Prisma 扩展工具 —— 慢查询日志中间件。
 *
 * 通过 Prisma `$extends` 的 query 扩展实现，记录超过阈值的数据库查询。
 */

import { Prisma as MainPrisma } from '../../../prisma/main/generated/index.js'

// ────────────────────────────────────────────
//  Prisma 错误类型守卫
// ────────────────────────────────────────────

interface PrismaKnownError {
  code: string
  meta?: Record<string, unknown>
  message: string
}

/**
 * 判断 catch 到的 unknown 错误是否为 Prisma 已知请求错误。
 *
 * TypeScript 6 下 `export import` 别名无法用于 `instanceof` 类型收窄，
 * 故封装为类型谓词函数。
 */
export function isPrismaKnownError(err: unknown): err is PrismaKnownError {
  return err instanceof MainPrisma.PrismaClientKnownRequestError
}

/** 默认慢查询阈值（毫秒）。 */
const DEFAULT_THRESHOLD_MS = 200

/** 日志函数签名，兼容 Pino / console 等。 */
interface SlowQueryLogger {
  warn: (msg: string, ...args: unknown[]) => void
}

/**
 * 为 Prisma Client 添加慢查询日志扩展。
 *
 * 使用 `$extends` 的 `query.$allOperations` 拦截所有数据库操作，
 * 当执行时间超过阈值时通过 logger 输出警告。
 *
 * @param client - Prisma Client 实例（主库或聊天库均可）
 * @param logger - 日志对象，需实现 warn 方法（默认 console）
 * @param thresholdMs - 慢查询阈值，超过此值记录警告（默认 200ms）
 * @returns 包装后的 Prisma Client（类型与原始 client 一致）
 *
 * @example
 * ```ts
 * const db = createMainDb(config.DATABASE_URL)
 * const dbWithLogging = withSlowQueryLogging(db, console, 100)
 * ```
 */
export function withSlowQueryLogging<T extends { $extends: (extension: unknown) => unknown }>(
  client: T,
  logger: SlowQueryLogger = console,
  thresholdMs: number = DEFAULT_THRESHOLD_MS,
): T {
  const extension = MainPrisma.defineExtension({
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
