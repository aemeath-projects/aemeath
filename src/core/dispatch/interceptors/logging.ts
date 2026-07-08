/**
 * LoggingInterceptor —— 记录事件处理详情。
 */

import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { ContextApis } from '../adapter.js'
import type { OneBotContext } from '../context.js'

const log: PinoLogger = getLogger('dispatcher') as unknown as PinoLogger

const CTX_KEY_START_TIME = '_logging_start_time'

/** 日志拦截器：记录事件处理的开始时间、完成耗时及错误信息。 */
export class LoggingInterceptor implements HandlerInterceptor<AnyOneBotEvent, ContextApis> {
  async preHandle(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
  ): Promise<boolean> {
    ctx.setAttribute(CTX_KEY_START_TIME, Date.now())
    const c = ctx as unknown as OneBotContext
    const groupId = c.groupId !== undefined ? String(c.groupId) : 'N/A'
    log.debug(
      `正在处理事件 postType=${ctx.event.postType} userId=${String(c.userId)} groupId=${groupId}`,
    )
    return true
  }

  async postHandle(
    _ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
  ): Promise<void> {
    // 后置日志在 afterCompletion 中统一记录，此处为空
  }

  async afterCompletion(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    handler: ResolvedHandler,
    error?: Error,
  ): Promise<void> {
    const startTime = ctx.getAttribute(CTX_KEY_START_TIME)
    const durationMs = typeof startTime === 'number' ? Date.now() - startTime : 0

    const handlerName = `${handler.handlerName}.${String(handler.methodName)}`

    if (error) {
      log.error(`${handlerName} 处理失败，耗时 ${String(durationMs)}ms，错误：${error.message}`)
    } else {
      log.debug(`${handlerName} 处理完成，耗时 ${String(durationMs)}ms`)
    }
  }
}
