/** 账号 CRUD 业务服务 —— 账号信息的增删改查，解耦路由层对 Prisma 的直接依赖；注入 pool 后同步维护运行中的连接池。 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

import type { Account } from '#prisma/aemeath'

import { NapCatClientAdapter } from './adapter.js'
import type { AccountPool } from './bootstrap.js'
import type { AccountRole } from './roles.js'

import type { AemeathPrismaClient } from '@/core/db/index.js'

export type { Account }

const log: PinoLogger = getLogger('accounts') as unknown as PinoLogger

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
  // 注：role 目前不可通过此接口修改；未来若支持，需按"连接字段变化"同款 remove+add 逻辑重建 adapter。
  transport?: 'ws' | 'sse'
  endpoint?: string
  token?: string
  isEnabled?: boolean
}

/** 账号 CRUD 服务。注入 `pool` 后，会在账号连接配置变化时同步重建/移除运行中的 adapter。 */
export class AccountService {
  constructor(
    private readonly db: AemeathPrismaClient,
    private readonly pool?: AccountPool,
  ) {}

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
    const account = await this.db.account.create({ data })
    this._addToPoolIfEnabled(account)
    return account
  }

  async updateAccount(id: number, data: UpdateAccountInput): Promise<Account> {
    const before = await this.db.account.findUnique({ where: { id } })
    const after = await this.db.account.update({ where: { id }, data })
    if (before) {
      await this._syncPoolAfterUpdate(before, after)
    } else {
      log.warn({ accountId: id }, '更新账号时未找到更新前的记录，跳过连接池同步')
    }
    return after
  }

  async deleteAccount(id: number): Promise<void> {
    await this.db.account.delete({ where: { id } })
  }

  /** 若 pool 已注入且账号已启用，构造 adapter 并加入连接池（不自动 connect，交由用户显式触发）。 */
  private _addToPoolIfEnabled(account: Account): void {
    if (!this.pool || !account.isEnabled) return
    const clientId = `bot-${String(account.qq)}`
    if (this.pool.getClient(clientId)) return
    const adapter = new NapCatClientAdapter(account)
    this.pool.addClient(adapter, account.role as AccountRole)
  }

  /** 账号更新后，将 endpoint/token/transport/isEnabled 的变化同步到运行中的连接池。 */
  private async _syncPoolAfterUpdate(before: Account, after: Account): Promise<void> {
    if (!this.pool) return
    const clientId = `bot-${String(after.qq)}`
    const wasEnabled = before.isEnabled
    const isEnabled = after.isEnabled

    // enabled -> disabled：整体移出池子
    if (wasEnabled && !isEnabled) {
      if (this.pool.getClient(clientId)) await this.pool.removeClient(clientId)
      return
    }

    // disabled -> enabled：（重新）构建 adapter 加入池子，不自动连接
    if (!wasEnabled && isEnabled) {
      if (this.pool.getClient(clientId)) await this.pool.removeClient(clientId)
      const adapter = new NapCatClientAdapter(after)
      this.pool.addClient(adapter, after.role as AccountRole)
      return
    }

    if (!isEnabled) return

    const connFieldsChanged =
      before.endpoint !== after.endpoint ||
      before.token !== after.token ||
      before.transport !== after.transport
    if (!connFieldsChanged) return

    // 仍启用，且连接相关字段变化：重建 adapter，按旧状态决定是否自动重连
    const existing = this.pool.getClient(clientId)
    const wasConnected = existing?.state === 'connected'
    if (existing) await this.pool.removeClient(clientId)

    const adapter = new NapCatClientAdapter(after)
    this.pool.addClient(adapter, after.role as AccountRole)

    if (wasConnected) {
      try {
        await adapter.connect()
      } catch (err) {
        log.error({ err, accountId: after.id, clientId }, '账号更新后自动重连失败，请手动重新连接')
      }
    }
  }
}
