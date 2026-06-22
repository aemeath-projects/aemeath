/** SessionManager 生命周期注册 —— 全局会话管理器初始化与关闭。 */
import { resolve } from 'node:path'

import { loadEchoConfig } from '@aemeath-projects/exostrider/echo'
import { Service, Inject, Provide, Startup, Shutdown } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import { SessionManager } from '@aemeath-projects/exostrider/session'
import type { SessionConfig } from '@aemeath-projects/exostrider/session'

import { RedisLockProvider } from './redis-lock-provider.js'

import type { OneBotContext } from '@/core/dispatch/context.js'
import type { RedisStore } from '@/core/redis/store.js'

const log: PinoLogger = getLogger('session') as unknown as PinoLogger

@Service({ name: 'session_manager_bootstrap' })
export class SessionManagerBootstrap {
  @Inject('cache')
  private readonly cache!: RedisStore

  @Provide('session_manager')
  sessionManager!: SessionManager<OneBotContext>

  @Startup
  async start(): Promise<void> {
    const configPath = resolve(import.meta.dirname, '..', '..', '..', 'aemeath.config.ts')
    const rawConfig = await loadEchoConfig(configPath)
    const sessionTimeout: number =
      (rawConfig as unknown as { app?: { sessionTimeout?: number } }).app?.sessionTimeout ?? 300
    const config: SessionConfig = {
      sessionTimeout,
    }
    this.sessionManager = new SessionManager<OneBotContext>({
      config,
      lockProvider: new RedisLockProvider(this.cache),
      keyExtractor: (ctx) => {
        const userId = ctx.userId
        const groupId = ctx.groupId
        return `${String(userId)}_${String(groupId ?? 'private')}`
      },
    })
    log.info('SessionManager 已启动')
  }

  @Shutdown
  async stop(): Promise<void> {
    await this.sessionManager.cancelAll()
    log.info('SessionManager 已关闭')
  }
}
