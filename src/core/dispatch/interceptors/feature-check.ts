/**
 * FeatureCheckInterceptor —— 功能开关 + 角色权限检查拦截器。
 * 替代原 EventDispatcher.setFeatureChecker()。
 *
 * 职责边界：这里检查的是"当前用户"是否有权限触发某个功能（角色等级 + 功能开关），
 * 与 CapabilityInterceptor 检查"Bot 账号"在群内的权限等级是两个维度，不可合并——
 * 前者决定要不要处理这条消息，后者决定用哪个账号发送请求。
 */
import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { ContextApis } from '../adapter.js'
import type { OneBotContext } from '../context.js'
import type { FeatureChecker } from '../types.js'

export type { FeatureChecker }

/** 功能开关检查拦截器：preHandle 阶段读取 handler 元数据并检查是否允许执行。 */
export class FeatureCheckInterceptor implements HandlerInterceptor<AnyOneBotEvent, ContextApis> {
  private _checker: FeatureChecker | null = null

  /** 延迟注入权限检查器（在 LifecycleOrchestrator 完成后调用）。 */
  setChecker(checker: FeatureChecker): void {
    this._checker = checker
  }

  async preHandle(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
  ): Promise<boolean> {
    if (this._checker === null) return true
    return this._checker.check(ctx as unknown as OneBotContext)
  }
}
