/** SessionManager 生命周期注册 —— 全局会话管理器初始化与关闭。 */

import { SessionManager } from './manager.js'

import { Service, Inject, Provide, Startup, Shutdown } from '@/core/lifecycle/decorators/index.js'
import type { RedisStore } from '@/core/redis/store.js'

@Service({ name: 'session_manager_bootstrap' })
export class SessionManagerBootstrap {
  @Inject('cache')
  private readonly cache!: RedisStore

  @Provide('session_manager')
  sessionManager!: SessionManager

  @Startup
  start(): void {
    this.sessionManager = new SessionManager(this.cache)
  }

  @Shutdown
  async stop(): Promise<void> {
    await this.sessionManager.close()
  }
}
