/**
 * MetricsInterceptor —— 收集 handler 调用次数、耗时直方图和错误计数的 Prometheus 指标。
 */

import type {
  Context,
  HandlerInterceptor,
  ResolvedHandler,
} from '@aemeath-projects/exostrider/dispatch'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { ContextApis } from '../adapter.js'

import { eventProcessed, eventProcessingSeconds, eventErrors } from '@/core/monitoring/index.js'

const CTX_KEY_START_TIME = '_metrics_start_time'

/**
 * 指标拦截器：跟踪 handler 调用次数、耗时直方图和错误计数。
 *
 * 用 HandlerInterceptor（而非 DispatchInterceptor）是因为这几个指标本质是
 * "某个具体 handler 的调用次数/耗时"，语义上必须绑定到命中的 handler 才有意义；
 * "总收到消息数"已有独立的 wsMessagesReceived 指标覆盖，两者互补不重复。
 */
export class MetricsInterceptor implements HandlerInterceptor<AnyOneBotEvent, ContextApis> {
  async preHandle(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
  ): Promise<boolean> {
    ctx.setAttribute(CTX_KEY_START_TIME, Date.now())
    return true
  }

  async postHandle(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    handler: ResolvedHandler,
  ): Promise<void> {
    // 标签名由 Prometheus 惯例（snake_case）与 metricRegistry 中的 labelNames 定义决定
    // eslint-disable-next-line @typescript-eslint/naming-convention
    eventProcessed.inc({ event_type: ctx.event.postType, handler: handler.handlerName })
  }

  async afterCompletion(
    ctx: Context<AnyOneBotEvent, ContextApis>,
    _handler: ResolvedHandler,
    error?: Error,
  ): Promise<void> {
    const start = ctx.getAttribute<number>(CTX_KEY_START_TIME)
    if (start !== undefined) {
      eventProcessingSeconds.observe((Date.now() - start) / 1000)
    }
    if (error) {
      eventErrors.inc()
    }
  }
}
