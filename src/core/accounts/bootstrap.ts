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
import type { NapCatClient } from '@aemeath-projects/napcat'
import { MessageApi, GroupApi, FriendApi } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import { NapCatClientAdapter } from './adapter.js'
import { OneBotDedupKeyExtractor } from './dedup.js'
import { GroupMembershipTracker } from './membership.js'
import { getRolesForMode } from './roles.js'
import type { AccountRole } from './roles.js'
import { MessageRouter } from './router.js'

import type { MainPrismaClient } from '@/core/db/index.js'

const log: PinoLogger = getLogger('MultiAccountBootstrap') as unknown as PinoLogger

export type AccountPool = ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>

/** 主账号 API bundle —— 供需要特定账号操作的 service 注入。 */
export interface MasterApis {
  msgApi: MessageApi
  groupApi: GroupApi
  friendApi: FriendApi
}

@Service({ name: 'multi_account_bootstrap' })
export class MultiAccountBootstrap {
  @Inject('db')
  db!: MainPrismaClient

  @Provide('account_pool')
  pool!: AccountPool

  @Provide('message_router')
  router!: MessageRouter

  @Provide('membership_tracker')
  tracker!: GroupMembershipTracker

  @Provide('master_apis')
  masterApis!: MasterApis

  /** 启动期间创建的路由表，供 clientStateChange 监听器引用。 */
  private _routingTable!: RoutingTable<bigint>

  @Startup
  async start(): Promise<void> {
    const appConfig = (await import('@/../aemeath.config.js')).default
    const mode = appConfig.routing?.defaultPriorityMode ?? 'prefer_master'

    // 1. 从数据库加载账号
    const accounts = await this.db.account.findMany({ where: { isEnabled: true } })
    log.info(`MultiAccountBootstrap: 加载 ${String(accounts.length)} 个账号`)

    // 2. 创建 ClientPool
    this.pool = new ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>({
      roles: getRolesForMode(mode),
      dedup: {
        keyExtractor: new OneBotDedupKeyExtractor(),
        windowMs: appConfig.routing?.dedupWindowMs ?? 5_000,
        maxCacheSize: 100_000,
      },
    })

    // 3. 注册所有账号，addClient 会自动调用 adapter.wireToPool 完成事件绑定
    for (const account of accounts) {
      const adapter = new NapCatClientAdapter(account)
      this.pool.addClient(adapter, account.role as AccountRole)
    }

    // 4. 并行连接（重连由 napcat SDK WebSocketTransport 管理）
    await this.pool.connectAll()

    // 5. 初始化群关系追踪
    this.tracker = new GroupMembershipTracker()
    const available = this.pool.getAvailableClients()
    await Promise.all(
      available.map(async (adapter) => {
        const napCatAdapter = adapter as NapCatClientAdapter
        const groupApi = new GroupApi(napCatAdapter.client)
        await this.tracker.syncFromClient(napCatAdapter, groupApi)
      }),
    )

    // 6. 创建路由表和消息路由器
    this._routingTable = new RoutingTable<bigint>({
      strategy: new PriorityStickyStrategy(),
      keySerializer: (groupId) => String(groupId),
    })
    this.router = new MessageRouter(this.pool, this._routingTable, this.tracker)

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
        msgApi: null as unknown as MessageApi,
        groupApi: null as unknown as GroupApi,
        friendApi: null as unknown as FriendApi,
      }
    }

    // 8. 监听连接状态变化
    this.pool.on('clientStateChange', (clientId, _from, to) => {
      if (to === 'disconnected' || to === 'error') {
        this._routingTable.invalidate(clientId)
        log.warn(`账号 ${clientId} 下线，已清除路由映射`)
      }
      if (to === 'connected') {
        const adapter = this.pool.getClient(clientId) as NapCatClientAdapter | undefined
        if (adapter) {
          const groupApi = new GroupApi(adapter.client)
          void this.tracker.syncFromClient(adapter, groupApi)
        }
      }
    })

    // 9. 启动健康检测
    this.pool.startHealthCheck(appConfig.routing?.healthCheckIntervalMs ?? 30_000)
    log.info('MultiAccountBootstrap: 多账号系统启动完成')
  }

  @Shutdown
  async stop(): Promise<void> {
    this.pool.stopHealthCheck()
    await this.pool.disconnectAll()
    log.info('MultiAccountBootstrap: 已断开所有账号连接')
  }
}
