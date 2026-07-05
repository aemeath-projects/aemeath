/**
 * Prisma 客户端工厂函数。
 */
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient as AemeathPrismaClient } from '#prisma/aemeath'
import { PrismaClient as IrisPrismaClient } from '#prisma/iris'

export type { IrisPrismaClient, AemeathPrismaClient }

/**
 * 创建主库 Prisma Client 实例。
 *
 * @param url - PostgreSQL 连接字符串（DATABASE_URL）
 * @param poolSize - 可选，连接池最大连接数
 */
export function createAemeathDb(url: string, poolSize?: number): AemeathPrismaClient {
  const adapter = new PrismaPg({ connectionString: url, max: poolSize })
  return new AemeathPrismaClient({ adapter })
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
