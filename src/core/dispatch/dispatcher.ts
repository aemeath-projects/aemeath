/**
 * EventDispatcher —— 统一事件分发（类似 Spring DispatcherServlet）。
 */

import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'
import { logger } from '@logger'

import { Context, FinishError } from './context.js'
import type { ContextApis } from './context.js'
import type { InterceptorEntry } from './decorators/symbols.js'
import type { HandlerInterceptor } from './interceptor.js'
import type { CompositeHandlerMapping, FeatureChecker, ResolvedHandler } from './mapping.js'

/**
 * 接收已解析的事件，通过映射解析处理器，并运行拦截器链。
 *
 * 权限检查（功能级 + 角色级）统一委托给 featureChecker，
 * 分发器不实现任何权限规则。
 *
 * 拦截器执行顺序（每个 handler 独立执行一次）：
 *   preHandle → handler.method → postHandle → afterCompletion
 *   异常时：→ afterCompletion(error)
 */
export class EventDispatcher {
  private readonly _log = logger.child({ name: 'dispatcher' })

  constructor(
    private readonly mapping: CompositeHandlerMapping,
    private readonly interceptors: HandlerInterceptor[] = [],
    private _featureChecker?: FeatureChecker,
  ) {}

  /** 延迟注入权限检查器（在 Startup 完成后设置）。 */
  setFeatureChecker(checker: FeatureChecker): void {
    this._featureChecker = checker
  }

  /** 分发事件到匹配的处理器，依次运行拦截器链。 */
  async dispatch(event: AnyOneBotEvent, apis: ContextApis): Promise<void> {
    const ctx = new Context(event, apis)

    // 解析匹配的处理器
    const resolvedHandlers = this.mapping.resolve(event)
    if (resolvedHandlers.length === 0) {
      return
    }

    // 按优先级执行处理器
    for (const resolved of resolvedHandlers) {
      // 设置正则匹配结果（仅 regex 类型 handler 有值）
      if (resolved.regexMatch !== null) {
        ctx.setRegexMatch(resolved.regexMatch)
      }

      // 注入 handler 元数据供权限检查器读取
      ctx.setAttribute('handlerMethod', {
        componentName: resolved.handler.componentName,
        methodName: resolved.handler.method.name,
        permission: resolved.handler.meta.permission,
      })

      // 统一权限检查（功能级 + 角色级，由 featureChecker 统一处理）
      if (this._featureChecker !== undefined) {
        const allowed = await this._featureChecker.check(ctx)
        if (!allowed) {
          continue
        }
      }

      await this._runHandlerWithInterceptors(ctx, resolved)
    }
  }

  /** 为单个 handler 运行完整的拦截器链（全局 + 声明式）。 */
  private async _runHandlerWithInterceptors(
    ctx: Context,
    resolved: ResolvedHandler,
  ): Promise<void> {
    // 实例化声明式拦截器（每次 dispatch 按需创建，不缓存）
    const declInterceptors = this._instantiateInterceptors(resolved.handler.interceptors)

    let handlerError: Error | undefined

    // 全局拦截器 preHandle（顺序）
    for (const interceptor of this.interceptors) {
      try {
        const ok = await interceptor.preHandle(ctx, resolved)
        if (!ok) {
          this._log.debug(`拦截器 ${interceptor.constructor.name} 已阻断事件`)
          return
        }
      } catch (err) {
        handlerError = err instanceof Error ? err : new Error(String(err))
        this._log.error(`preHandle 中发生错误：${handlerError.message}`)
        break
      }
    }

    if (handlerError !== undefined) {
      await this._runAfterCompletion(this.interceptors, ctx, resolved, handlerError)
      await this._runAfterCompletion(declInterceptors, ctx, resolved, handlerError)
      return
    }

    // 声明式拦截器 preHandle（顺序，记录已执行 preHandle 的拦截器）
    const executedDecl: HandlerInterceptor[] = []
    let declBlocked = false
    for (const interceptor of declInterceptors) {
      try {
        const ok = await interceptor.preHandle(ctx, resolved)
        // 无论通过与否，只要执行了 preHandle，就应执行 afterCompletion
        executedDecl.push(interceptor)
        if (!ok) {
          this._log.debug(`声明式拦截器 ${interceptor.constructor.name} 已阻断事件`)
          declBlocked = true
          break
        }
      } catch (err) {
        handlerError = err instanceof Error ? err : new Error(String(err))
        this._log.error(`声明式拦截器 preHandle 中发生错误：${handlerError.message}`)
        break
      }
    }

    if (declBlocked || handlerError !== undefined) {
      await this._runAfterCompletion(this.interceptors, ctx, resolved, handlerError)
      await this._runAfterCompletion(executedDecl, ctx, resolved, handlerError)
      return
    }

    // 调用处理器方法
    try {
      const fn = resolved.handler.method
      await (fn as (this: object, ...args: unknown[]) => Promise<unknown>).call(
        resolved.handler.instance,
        ctx,
      )

      // postHandle（声明式逆序，全局逆序）
      for (const interceptor of [...declInterceptors].reverse()) {
        try {
          await interceptor.postHandle(ctx, resolved)
        } catch (err) {
          handlerError = err instanceof Error ? err : new Error(String(err))
          this._log.error(`声明式拦截器 postHandle 中发生错误：${handlerError.message}`)
          break
        }
      }
      for (const interceptor of [...this.interceptors].reverse()) {
        try {
          await interceptor.postHandle(ctx, resolved)
        } catch (err) {
          handlerError = err instanceof Error ? err : new Error(String(err))
          this._log.error(`postHandle 中发生错误：${handlerError.message}`)
          break
        }
      }
    } catch (err) {
      if (err instanceof FinishError) {
        // 正常流程终止，不视为错误
      } else {
        handlerError = err instanceof Error ? err : new Error(String(err))
        this._log.error(
          `handler ${resolved.handler.componentName}.${resolved.handler.method.name} 执行失败：${handlerError.message}`,
        )
      }
    }

    // afterCompletion（始终执行，全局逆序，声明式逆序）
    await this._runAfterCompletion(this.interceptors, ctx, resolved, handlerError)
    await this._runAfterCompletion(declInterceptors, ctx, resolved, handlerError)
  }

  /** 批量执行 afterCompletion（逆序，忽略内部错误）。 */
  private async _runAfterCompletion(
    interceptors: readonly HandlerInterceptor[],
    ctx: Context,
    resolved: ResolvedHandler,
    error: Error | undefined,
  ): Promise<void> {
    for (const interceptor of [...interceptors].reverse()) {
      try {
        await interceptor.afterCompletion(ctx, resolved, error)
      } catch (cleanupErr) {
        this._log.error(`afterCompletion 中发生错误：${String(cleanupErr)}`)
      }
    }
  }

  /** 按需实例化声明式拦截器列表。 */
  private _instantiateInterceptors(entries: readonly InterceptorEntry[]): HandlerInterceptor[] {
    return entries.map((entry) => new entry.interceptorClass(entry.options) as HandlerInterceptor)
  }
}
