/**
 * SessionInterceptor —— 会话消息路由拦截器。
 *
 * 在 handler 执行前检查用户是否有活跃的交互式会话：
 * - 有会话 → 将消息路由到会话状态机（阻断后续 handler 链）
 * - 无会话 → 放行给常规 handler 处理
 *
 * 取消命令（/取消、/cancel）在会话进行中时终止会话。
 */

import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { SessionManager } from '@aemeath-projects/exostrider/session'
import { DEFAULT_CANCEL_COMMANDS } from '@aemeath-projects/exostrider/session'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { ContextApis } from '../adapter.js'
import type { OneBotContext } from '../context.js'

const log: PinoLogger = getLogger('session-interceptor') as unknown as PinoLogger

/** 会话拦截器：将活跃会话的用户消息路由到状态机，阻断常规 handler 链。 */
export class SessionInterceptor implements HandlerInterceptor<AnyOneBotEvent, ContextApis> {
  private _sessionManager: SessionManager<OneBotContext> | null = null

  /** 延迟注入 SessionManager（在 LifecycleOrchestrator 完成后调用）。 */
  setSessionManager(manager: SessionManager<OneBotContext>): void {
    this._sessionManager = manager
  }

  async preHandle(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
  ): Promise<boolean> {
    const c = ctx as unknown as OneBotContext
    // 仅拦截消息事件（notice/request 不参与会话路由）
    if (ctx.event.postType !== 'message') return true

    // SessionManager 尚未就绪时放行（启动瞬间的极短窗口）
    if (this._sessionManager === null) return true

    // 计算与 keyExtractor 一致的会话 key
    const sessionKey = `${String(c.userId)}_${String(c.groupId ?? 'private')}`
    if (!this._sessionManager.isActive(sessionKey)) return true

    // 有活跃会话 → 路由消息到会话
    const text = c.getPlaintext()

    if (DEFAULT_CANCEL_COMMANDS.includes(text)) {
      log.debug(`用户 ${String(c.userId)} 取消会话`)
      await this._sessionManager.cancel(sessionKey)
    } else {
      await this._sessionManager.processMessage(c, text)
    }

    // 阻断后续 handler 链
    return false
  }

  async postHandle(
    _ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
  ): Promise<void> {
    // 无操作
  }

  async afterCompletion(
    _ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
    _error?: Error,
  ): Promise<void> {
    // 无操作
  }
}
