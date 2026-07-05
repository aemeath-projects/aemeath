/**
 * Prisma 错误识别工具。
 */
import { Prisma as AemeathPrisma } from '#prisma/aemeath'

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
  return err instanceof AemeathPrisma.PrismaClientKnownRequestError
}
