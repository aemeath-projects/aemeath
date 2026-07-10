/** 账号 CRUD 业务服务 —— 账号信息的增删改查，解耦路由层对 Prisma 的直接依赖；注入 pool 后同步维护运行中的连接池。 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

import type { Account } from '#prisma/aemeath'

import { NapCatClientAdapter } from './adapter.js'
import type { AccountPool } from './bootstrap.js'
import type { GroupBotRegistry, GroupBotRole } from './group-bot-registry.js'
import type { AccountRole, PriorityMode } from './roles.js'
import type { MessageRouter } from './router.js'
import { accountStatusBroadcaster } from './status-broadcaster.js'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import { AppError } from '@/core/errors.js'
import { Path } from '@/core/settings/index.js'
import type { SettingsService } from '@/core/settings/index.js'

export type { Account }

/** 账号 + 实时连接状态组合视图，供批量状态查询使用。 */
export interface AccountWithStatus extends Account {
  state: 'connected' | 'disconnected' | 'connecting' | 'unknown'
}

const log: PinoLogger = getLogger('accounts') as unknown as PinoLogger

/** 创建账号所需字段。 */
export interface CreateAccountInput {
  qq: string
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
    private readonly router?: MessageRouter,
    private readonly settings?: SettingsService,
    private readonly groupBotRegistry?: GroupBotRegistry,
  ) {}

  async listAccounts(): Promise<Account[]> {
    return this.db.account.findMany({ orderBy: { qq: 'asc' } })
  }

  /** 批量查询账号信息 + 实时连接状态，替代"先列表再逐个查状态"的 N+1 模式。 */
  async listAccountsWithStatus(): Promise<AccountWithStatus[]> {
    const accounts = await this.listAccounts()
    return accounts.map((account) => {
      const clientId = account.qq
      const adapter = this.pool?.getClient(clientId)
      const state = adapter?.state
      return { ...account, state: state === 'error' ? 'unknown' : (state ?? 'unknown') }
    })
  }

  async getAccount(qq: string): Promise<Account | null> {
    return this.db.account.findUnique({ where: { qq } })
  }

  /** 查询单个账号信息 + 实时连接状态，供状态广播复用。 */
  async getAccountWithStatus(qq: string): Promise<AccountWithStatus | null> {
    const account = await this.getAccount(qq)
    if (!account) return null
    const adapter = this.pool?.getClient(qq)
    const state = adapter?.state
    return { ...account, state: state === 'error' ? 'unknown' : (state ?? 'unknown') }
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

  async updateAccount(qq: string, data: UpdateAccountInput): Promise<Account> {
    const before = await this.db.account.findUnique({ where: { qq } })
    const patch: UpdateAccountInput & { disabledReason?: string | null } = { ...data }
    if (before) {
      if (data.isEnabled === false && before.isEnabled) patch.disabledReason = 'manual'
      if (data.isEnabled === true && !before.isEnabled) patch.disabledReason = null
    }
    const after = await this.db.account.update({ where: { qq }, data: patch })
    if (before) {
      await this._syncPoolAfterUpdate(before, after)
    } else {
      log.warn({ qq }, '更新账号时未找到更新前的记录，跳过连接池同步')
    }
    return after
  }

  async deleteAccount(qq: string): Promise<void> {
    await this.db.account.delete({ where: { qq } })
  }

  /** 读取当前多账号路由优先级模式，未设置时回退 Schema 默认值（prefer_master）。 */
  async getPriorityMode(): Promise<PriorityMode> {
    if (!this.settings) {
      throw new AppError(-1, 'AccountService 未注入 settings，无法读取优先级模式', 500)
    }
    return this.settings.get<PriorityMode>('accounts.priority_mode', Path.system())
  }

  /** 切换路由优先级模式：写入 Settings 并驱动 MessageRouter 立即生效。 */
  async setPriorityMode(mode: PriorityMode): Promise<void> {
    if (!this.settings) {
      throw new AppError(-1, 'AccountService 未注入 settings，无法设置优先级模式', 500)
    }
    await this.settings.set('accounts.priority_mode', mode, Path.system(), '__system__', {
      bypassOwnership: true,
    })
    this.router?.setPriorityMode(mode)
  }

  /** 若 pool 已注入且账号已启用，构造 adapter 并加入连接池，随后 fire-and-forget 尝试连接。 */
  private _addToPoolIfEnabled(account: Account): void {
    if (!this.pool || !account.isEnabled) return
    const clientId = account.qq
    if (this.pool.getClient(clientId)) return
    const adapter = new NapCatClientAdapter(account)
    this.pool.addClient(adapter, account.role as AccountRole)
    this._registerGroupNotices(adapter)
    accountStatusBroadcaster.broadcast({ ...account, state: 'connecting' })
    void adapter.connect().catch((err: unknown) => {
      log.error({ err, qq: account.qq }, '账号创建后自动连接失败，将由重连策略自动重试')
    })
  }

  /** 账号更新后，将 endpoint/token/transport/isEnabled 的变化同步到运行中的连接池。 */
  private async _syncPoolAfterUpdate(before: Account, after: Account): Promise<void> {
    if (!this.pool) return
    const clientId = after.qq
    const wasEnabled = before.isEnabled
    const isEnabled = after.isEnabled

    // enabled -> disabled：整体移出池子
    if (wasEnabled && !isEnabled) {
      this._cleanupAdapterNotices(clientId)
      if (this.pool.getClient(clientId)) await this.pool.removeClient(clientId)
      accountStatusBroadcaster.broadcast({ ...after, state: 'unknown' })
      return
    }

    // disabled -> enabled：（重新）构建 adapter 加入池子，自动尝试连接
    if (!wasEnabled && isEnabled) {
      this._cleanupAdapterNotices(clientId)
      if (this.pool.getClient(clientId)) await this.pool.removeClient(clientId)
      const adapter = new NapCatClientAdapter(after)
      this.pool.addClient(adapter, after.role as AccountRole)
      this._registerGroupNotices(adapter)
      accountStatusBroadcaster.broadcast({ ...after, state: 'connecting' })
      void adapter.connect().catch((err: unknown) => {
        log.error({ err, qq: after.qq }, '账号启用后自动连接失败，将由重连策略自动重试')
      })
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
    this._cleanupAdapterNotices(clientId)
    if (existing) await this.pool.removeClient(clientId)

    const adapter = new NapCatClientAdapter(after)
    this.pool.addClient(adapter, after.role as AccountRole)
    this._registerGroupNotices(adapter)
    accountStatusBroadcaster.broadcast({ ...after, state: 'connecting' })

    if (wasConnected) {
      try {
        await adapter.connect()
      } catch (err) {
        log.error({ err, qq: after.qq, clientId }, '账号更新后自动重连失败，请手动重新连接')
      }
    }
  }

  /** 移除旧 adapter 上的 notice 监听器，避免内存泄漏。 */
  private _cleanupAdapterNotices(clientId: string): void {
    const adapter = this.pool?.getClient(clientId) as NapCatClientAdapter | undefined
    if (adapter) {
      adapter.client.removeAllListeners('notice')
    }
  }

  /** 为新创建的 adapter 注册 GroupBotRegistry 的增量 notice 监听器，使其群成员角色能动态更新。 */
  private _registerGroupNotices(adapter: NapCatClientAdapter): void {
    const registry = this.groupBotRegistry
    if (!registry) return
    const botQq = adapter.qq

    adapter.client.on('notice', (raw) => {
      try {
        const event = raw as {
          noticeType?: string
          subType?: string
          groupId?: string | number
          userId?: number
        }
        const { noticeType, subType, groupId, userId } = event

        if (noticeType === 'group_admin' && groupId != null && userId != null) {
          if (userId !== Number(botQq)) return
          const role: GroupBotRole = subType === 'set' ? 'admin' : 'member'
          registry.setRole(String(groupId), adapter.id, role)
        }

        if (noticeType === 'group_decrease' && groupId != null) {
          if (subType === 'kick_me' || subType === 'leave') {
            registry.removeClient(String(groupId), adapter.id)
          }
        }

        if (noticeType === 'group_increase' && groupId != null && userId != null) {
          if (userId !== Number(botQq)) return
          registry.setRole(String(groupId), adapter.id, 'member')
        }
      } catch (err: unknown) {
        log.error({ err, adapterId: adapter.id }, 'GroupBotRegistry notice 处理失败')
      }
    })
  }
}
