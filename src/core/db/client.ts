/**
 * Prisma Client 工厂函数 —— 分别创建主库和聊天库客户端实例。
 *
 * 包含 BigInt → number 序列化支持（QQ 号等字段安全范围内）。
 */

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient as ChatPrismaClient } from '#prisma/chat'
import { PrismaClient as MainPrismaClient } from '#prisma/main'

export type { ChatPrismaClient, MainPrismaClient }

// ────────────────────────────────────────────
//  BigInt JSON 序列化
// ────────────────────────────────────────────

/**
 * 全局注册 BigInt.prototype.toJSON，使 JSON.stringify 自动将 BigInt 转为 number。
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

// ────────────────────────────────────────────
//  工厂函数
// ────────────────────────────────────────────

/**
 * 创建主库 Prisma Client 实例。
 *
 * @param url - PostgreSQL 连接字符串（DATABASE_URL）
 * @param poolSize - 可选，连接池最大连接数
 */
export function createMainDb(url: string, poolSize?: number): MainPrismaClient {
  const adapter = new PrismaPg({ connectionString: url, max: poolSize })
  return new MainPrismaClient({ adapter })
}

/**
 * 创建聊天库 Prisma Client 实例。
 *
 * @param url - PostgreSQL 连接字符串（CHAT_DATABASE_URL）
 * @param poolSize - 可选，连接池最大连接数
 */
export function createChatDb(url: string, poolSize?: number): ChatPrismaClient {
  const adapter = new PrismaPg({ connectionString: url, max: poolSize })
  return new ChatPrismaClient({ adapter })
}
