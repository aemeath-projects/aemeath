/**
 * SessionInterceptor —— 会话消息路由拦截器。
 *
 * 在 handler 执行前检查用户是否有活跃的交互式会话：
 * - 有会话 → 将消息路由到会话状态机（阻断后续 handler 链）
 * - 无会话 → 放行给常规 handler 处理
 *
 * 取消命令（/取消、/cancel）在会话进行中时终止会话。
 */

import { logger, type Logger } from '@logger'

import type { Context } from '@/core/dispatch/context.js'
import type { HandlerInterceptor } from '@/core/dispatch/interceptor.js'
import type { ResolvedHandler } from '@/core/dispatch/mapping.js'
import { SessionManager } from '@/core/session/manager.js'

/** 会话拦截器：将活跃会话的用户消息路由到状态机，阻断常规 handler 链。 */
export class SessionInterceptor implements HandlerInterceptor {
  private readonly _log: Logger = logger.child({ name: 'session-interceptor' })
  private _sessionManager: SessionManager | null = null

  /** 延迟注入 SessionManager（在 LifecycleOrchestrator 完成后调用）。 */
  setSessionManager(manager: SessionManager): void {
    this._sessionManager = manager
  }

  async preHandle(ctx: Context, _handler: ResolvedHandler): Promise<boolean> {
    // 仅拦截消息事件（notice/request 不参与会话路由）
    if (ctx.event.postType !== 'message') return true

    // SessionManager 尚未就绪时放行（启动瞬间的极短窗口）
    if (this._sessionManager === null) return true

    const sessionKey = this._sessionManager.getActiveSessionKey(ctx.userId, ctx.groupId)
    if (sessionKey === null) return true

    // 有活跃会话 → 路由消息到会话
    const text = ctx.getPlaintext()

    if (SessionManager.isCancelCommand(text)) {
      this._log.debug(`用户 ${String(ctx.userId)} 取消会话`)
      await this._sessionManager.cancelSession(sessionKey, ctx)
    } else {
      await this._sessionManager.dispatchInput(sessionKey, ctx)
    }

    // 阻断后续 handler 链
    return false
  }

  async postHandle(_ctx: Context, _handler: ResolvedHandler): Promise<void> {
    // 无操作
  }

  async afterCompletion(_ctx: Context, _handler: ResolvedHandler, _error?: Error): Promise<void> {
    // 无操作
  }
}
