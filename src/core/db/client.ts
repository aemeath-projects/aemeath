/**
 * Prisma Client 工厂函数 —— 分别创建主库和聊天库客户端实例。
 *
 * 包含 BigInt → number 序列化支持（QQ 号等字段安全范围内）。
 */

import { PrismaClient as ChatPrismaClient } from '../../../prisma/chat/generated/index.js'
import { PrismaClient as MainPrismaClient } from '../../../prisma/main/generated/index.js'

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
//  连接 URL 工具
// ────────────────────────────────────────────

/**
 * 将 connection_limit 参数追加到 PostgreSQL 连接 URL。
 *
 * 如果 URL 已包含 connection_limit 参数则不做修改。
 */
function appendConnectionLimit(url: string, poolSize: number): string {
  const parsed = new URL(url)
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', String(poolSize))
  }
  return parsed.toString()
}

// ────────────────────────────────────────────
//  工厂函数
// ────────────────────────────────────────────

/**
 * 创建主库 Prisma Client 实例。
 *
 * @param url - PostgreSQL 连接字符串（DATABASE_URL）
 * @param poolSize - 可选，连接池大小，追加为 URL 的 connection_limit 参数
 */
export function createMainDb(url: string, poolSize?: number): MainPrismaClient {
  process.env.DATABASE_URL = poolSize != null ? appendConnectionLimit(url, poolSize) : url

  return new MainPrismaClient()
}

/**
 * 创建聊天库 Prisma Client 实例。
 *
 * @param url - PostgreSQL 连接字符串（CHAT_DATABASE_URL）
 * @param poolSize - 可选，连接池大小，追加为 URL 的 connection_limit 参数
 */
export function createChatDb(url: string, poolSize?: number): ChatPrismaClient {
  process.env.CHAT_DATABASE_URL = poolSize != null ? appendConnectionLimit(url, poolSize) : url

  return new ChatPrismaClient()
}
