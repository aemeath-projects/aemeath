/**
 * Prisma 客户端统一导出 —— BigInt 序列化 patch + 桶导出。
 */

/* BigInt JSON 序列化 patch（模块级副作用）
 *
 * QQ 号最大值远小于 Number.MAX_SAFE_INTEGER (2^53 - 1)，直接转换安全可靠。
 * 放在模块顶层确保 import 即生效。
 */
declare global {
  interface BigInt {
    toJSON(): number
  }
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!BigInt.prototype.toJSON) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function (this: bigint): number {
      return Number(this)
    },
    writable: true,
    configurable: true,
  })
}

export * from './factory.js'
export * from './extensions.js'
export * from './guards.js'
