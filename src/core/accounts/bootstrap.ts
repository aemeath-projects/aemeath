/**
 * MultiAccountBootstrap —— 替换 BotClientBootstrap，管理多账号连接池。
 *
 * 启动流程：
 * 1. 从数据库加载所有 isEnabled 账号
 * 2. 创建 ClientPool（含去重 pipeline）
 * 3. 为每个账号创建 NapCatClientAdapter，加入连接池（addClient 自动触发事件绑定）
 * 4. 并行连接所有账号（重连由 napcat SDK 的 WebSocketTransport 管理）
 * 5. 同步群成员关系（拉取各账号已加的群列表）
 * 6. 创建 RoutingTable + MessageRouter
 * 7. 构建主账号 API bundle（master_apis）
 * 8. 注册状态变化处理：失效路由表 + 重新同步群关系
 * 9. 启动健康检测
 *
 * 注意：事件管道（pool → dispatcher）在 main.ts 完成，bootstrap 不持有 dispatcher 引用。
 */
import { Service, Inject, Provide, Startup, Shutdown } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import { ClientPool, RoutingTable, PriorityStickyStrategy } from '@aemeath-projects/exostrider/pool'
import type { ClientState } from '@aemeath-projects/exostrider/pool'
import type { NapCatClient } from '@aemeath-projects/napcat'
import { MessageApi, GroupApi, FriendApi } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import pLimit from 'p-limit'
import type { LimitFunction } from 'p-limit'

import { NapCatClientAdapter } from './adapter.js'
import { OneBotDedupKeyExtractor } from './dedup.js'
import { GroupBotRegistry } from './group-bot-registry.js'
import type { GroupBotRole } from './group-bot-registry.js'
import type { AccountRole } from './roles.js'
import { MessageRouter } from './router.js'

import type { AemeathPrismaClient } from '@/core/db/index.js'

const log: PinoLogger = getLogger('accounts') as unknown as PinoLogger

/**
 * 路由优先级模式启动期默认值（与 settings/schema.ts 中 accounts.priority_mode 的 default 保持一致）。
 *
 * 注意：此处不通过 @Inject('settings') 在启动时读取持久化值——SettingsBootstrap 依赖
 * adminService（来自 AdminBootstrap），而 AdminBootstrap 又依赖本模块提供的 master_apis，
 * 若此处再反向注入 settings 会闭合三者的循环依赖。持久化的优先级模式改为在 main.ts 中，
 * 所有服务启动完成后统一同步覆盖（与 settings_checker/session_manager 的延迟绑定模式一致）。
 */
const DEFAULT_PRIORITY_MODE = 'prefer_master'

export type AccountPool = ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>

/** 主账号 API bundle —— 供需要特定账号操作的 service 注入。无主账号时各字段为 null。 */
export interface MasterApis {
  msgApi: MessageApi | null
  groupApi: GroupApi | null
  friendApi: FriendApi | null
}

@Service({ name: 'multi_account_bootstrap' })
export class MultiAccountBootstrap {
  @Inject('db')
  db!: AemeathPrismaClient

  @Provide('account_pool')
  pool!: AccountPool

  @Provide('message_router')
  router!: MessageRouter

  @Provide('group_bot_registry')
  registry!: GroupBotRegistry

  @Provide('master_apis')
  masterApis!: MasterApis

  /** 启动期间创建的路由表，供 clientStateChange 监听器引用。 */
  private _routingTable!: RoutingTable<string>

  @Startup
  async start(): Promise<void> {
    const appConfig = (await import('@/../aemeath.config.js')).default
    // 启动期使用 Schema 默认值，持久化配置由 main.ts 在全部服务启动完成后同步覆盖
    const mode = DEFAULT_PRIORITY_MODE

    // 1. 从数据库加载账号
    const accounts = await this.db.account.findMany({ where: { isEnabled: true } })
    log.info(`MultiAccountBootstrap: 加载 ${String(accounts.length)} 个账号`)

    // 2. 创建 ClientPool
    this.pool = new ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>({
      dedup: {
        keyExtractor: new OneBotDedupKeyExtractor(),
        windowMs: appConfig.routing?.dedupWindowMs ?? 5_000,
        maxCacheSize: 100_000,
      },
    })

    // 3. 注册所有账号，addClient 会自动调用 adapter.wireToPool 完成事件绑定
    const adaptersList: NapCatClientAdapter[] = [] // 保存引用，步骤 5 后绑定 notice 事件
    for (const account of accounts) {
      const adapter = new NapCatClientAdapter(account)
      adaptersList.push(adapter)
      this.pool.addClient(adapter, account.role as AccountRole)
    }

    // 4. 并行连接（重连由 napcat SDK WebSocketTransport 管理）
    await this.pool.connectAll()

    // 5. 初始化 GroupBotRegistry 并同步各账号在群内的 role
    this.registry = new GroupBotRegistry()
    const limitOuter = pLimit(3) // 外层：同时处理 3 个账号
    const limitInner = pLimit(10) // 内层：每个账号的群成员查询并发不超过 10

    const available = this.pool.getAvailableClients()
    await Promise.all(
      available.map((adapter) =>
        limitOuter(async () => {
          const napCatAdapter = adapter as NapCatClientAdapter
          await this._syncClientGroupRoles(napCatAdapter, limitInner)
        }),
      ),
    )

    // 增量更新 GroupBotRegistry：在 dedup 之前监听各账号的原始 notice 事件
    const botQqs = new Set(accounts.map((a) => a.qq)) // Set<string>

    for (const adapter of adaptersList) {
      adapter.client.on('notice', (event) => {
        try {
          const noticeType = (event as { noticeType?: string }).noticeType
          const subType = (event as { subType?: string }).subType
          const groupId = (event as { groupId?: number | bigint }).groupId
          const userId = (event as { userId?: number }).userId

          if (noticeType === 'group_admin' && groupId != null && userId != null) {
            if (!botQqs.has(String(userId))) return
            const role: GroupBotRole = subType === 'set' ? 'admin' : 'member'
            this.registry.setRole(String(groupId), adapter.id, role)
          }

          if (noticeType === 'group_decrease' && groupId != null) {
            if (subType === 'kick_me' || subType === 'leave') {
              this.registry.removeClient(String(groupId), adapter.id)
            }
          }

          if (noticeType === 'group_increase' && groupId != null && userId != null) {
            if (!botQqs.has(String(userId))) return
            this.registry.setRole(String(groupId), adapter.id, 'member')
          }
        } catch (err: unknown) {
          log.error({ err, adapterId: adapter.id }, 'GroupBotRegistry notice 处理失败')
        }
      })
    }

    // 6. 创建路由表和消息路由器
    this._routingTable = new RoutingTable<string>({
      strategy: new PriorityStickyStrategy(),
      keySerializer: (groupId) => groupId,
    })
    this.router = new MessageRouter(this.pool, this._routingTable, this.registry, mode)

    // 7. 构建主账号 API bundle
    const masterAdapters = this.pool.getClientsByRole('master')
    const masterAdapter = masterAdapters[0] as NapCatClientAdapter | undefined
    if (masterAdapter) {
      this.masterApis = {
        msgApi: new MessageApi(masterAdapter.client),
        groupApi: new GroupApi(masterAdapter.client),
        friendApi: new FriendApi(masterAdapter.client),
      }
    } else {
      log.warn('MultiAccountBootstrap: 未找到主账号，master_apis 将不可用')
      this.masterApis = {
        msgApi: null,
        groupApi: null,
        friendApi: null,
      }
    }

    // 8. 监听连接状态变化
    this.pool.on('clientStateChange', (clientId, from, to) => {
      this._handleClientStateChange(clientId, from, to)
    })

    // 9. 启动健康检测
    this.pool.startHealthCheck(appConfig.routing?.healthCheckIntervalMs ?? 30_000)
    log.info('MultiAccountBootstrap: 多账号系统启动完成')
  }

  /** 处理连接池状态变化：清除失效路由映射、放弃重连后自动禁用、重连后同步群角色。 */
  private _handleClientStateChange(clientId: string, _from: ClientState, to: ClientState): void {
    if (to === 'disconnected' || to === 'error') {
      this._routingTable.invalidate(clientId)
      log.warn(`账号 ${clientId} 下线，已清除路由映射`)
    }
    if (to === 'error') {
      void this._autoDisableAfterGiveUp(clientId).catch((err: unknown) => {
        log.error({ err, clientId }, '重连放弃后自动禁用账号失败')
      })
    }
    if (to === 'connected') {
      void (async () => {
        const adapter = this.pool.getClient(clientId) as NapCatClientAdapter | undefined
        if (adapter) {
          const limit2 = pLimit(10)
          await this._syncClientGroupRoles(adapter, limit2)
        }
      })().catch((err: unknown) => {
        log.error({ err }, `账号 ${clientId} 重连后同步群角色失败`)
      })
    }
  }

  /** 重连彻底放弃（error 状态）后，自动禁用对应账号并从连接池移除。 */
  private async _autoDisableAfterGiveUp(clientId: string): Promise<void> {
    const qq = clientId.replace('bot-', '')
    await this.db.account.update({ where: { qq }, data: { isEnabled: false } })
    if (this.pool.getClient(clientId)) await this.pool.removeClient(clientId)
    log.warn(`账号 ${clientId} 重连尝试次数已达上限，已自动禁用`)
  }

  /** 同步指定 bot 账号在各群内的角色至 GroupBotRegistry。 */
  private async _syncClientGroupRoles(
    adapter: NapCatClientAdapter,
    limit: LimitFunction,
  ): Promise<void> {
    const groupApi = new GroupApi(adapter.client)
    const listResult = await groupApi.getGroupList()
    if (!listResult.ok) return

    await Promise.all(
      listResult.data.map((group) =>
        limit(async () => {
          const memberInfoResult = await groupApi.getGroupMemberInfo(
            group.groupId,
            Number(adapter.qq), // 使用 .qq（bigint），不能用 .id（"bot-xxx" 字符串）
          )
          if (!memberInfoResult.ok) return
          const role = memberInfoResult.data.role
          this.registry.setRole(String(group.groupId), adapter.id, role)
        }),
      ),
    )
  }

  @Shutdown
  async stop(): Promise<void> {
    this.pool.stopHealthCheck()
    await this.pool.disconnectAll()
    log.info('MultiAccountBootstrap: 已断开所有账号连接')
  }
}
