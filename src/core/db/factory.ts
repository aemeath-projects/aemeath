/**
 * Prisma 客户端工厂函数。
 */
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient as ChatPrismaClient } from '#prisma/chat'
import { PrismaClient as MainPrismaClient } from '#prisma/main'

export type { ChatPrismaClient, MainPrismaClient }

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
