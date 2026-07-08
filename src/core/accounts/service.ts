/** 账号 CRUD 业务服务 —— 账号信息的增删改查，解耦路由层对 Prisma 的直接依赖。 */

import type { Account } from '#prisma/aemeath'

import type { AemeathPrismaClient } from '@/core/db/index.js'

export type { Account }

/** 创建账号所需字段。 */
export interface CreateAccountInput {
  qq: bigint
  nickname?: string | null
  role: 'master' | 'normal' | 'readonly'
  transport: 'ws' | 'sse'
  endpoint: string
  token?: string | null
  isEnabled?: boolean
}

/** 更新账号可修改字段。 */
export interface UpdateAccountInput {
  nickname?: string
  transport?: 'ws' | 'sse'
  endpoint?: string
  token?: string
  isEnabled?: boolean
}

/** 账号 CRUD 服务。 */
export class AccountService {
  constructor(private readonly db: AemeathPrismaClient) {}

  async listAccounts(): Promise<Account[]> {
    return this.db.account.findMany({ orderBy: { id: 'asc' } })
  }

  async getAccount(id: number): Promise<Account | null> {
    return this.db.account.findUnique({ where: { id } })
  }

  async hasMaster(): Promise<boolean> {
    const existing = await this.db.account.findFirst({ where: { role: 'master' } })
    return existing !== null
  }

  async createAccount(data: CreateAccountInput): Promise<Account> {
    return this.db.account.create({ data })
  }

  async updateAccount(id: number, data: UpdateAccountInput): Promise<Account> {
    return this.db.account.update({ where: { id }, data })
  }

  async deleteAccount(id: number): Promise<void> {
    await this.db.account.delete({ where: { id } })
  }
}
