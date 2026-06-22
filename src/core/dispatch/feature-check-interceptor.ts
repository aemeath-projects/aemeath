/**
 * FeatureCheckInterceptor —— 功能开关 + 角色权限检查拦截器。
 * 替代原 EventDispatcher.setFeatureChecker()。
 */
import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { ContextApis } from './adapter.js'
import type { OneBotContext } from './context.js'
import type { FeatureChecker } from './mapping-types.js'

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
