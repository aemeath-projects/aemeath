/**
 * Prisma 客户端工厂函数。
 */
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient as IrisPrismaClient } from '#prisma/iris'
import { PrismaClient as MainPrismaClient } from '#prisma/main'

export type { IrisPrismaClient, MainPrismaClient }

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
 * 创建 Iris 聊天库 Prisma Client 实例。
 *
 * @param url - PostgreSQL 连接字符串（IRIS_DATABASE_URL）
 * @param poolSize - 可选，连接池最大连接数
 */
export function createIrisDb(url: string, poolSize?: number): IrisPrismaClient {
  const adapter = new PrismaPg({ connectionString: url, max: poolSize })
  return new IrisPrismaClient({ adapter })
}
