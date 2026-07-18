/**
 * Bot 事件分发的 trace 包装 —— 修复 err-01（事件分发 fire-and-forget 未捕获
 * rejection）并接入 log-01/02 的轻量 trace context。
 */
import { randomUUID } from 'node:crypto'

import type { EventDispatcher } from '@aemeath-projects/exostrider/dispatch'
import { runWithTrace } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { AggregatedEvent, ClientPool } from '@aemeath-projects/exostrider/pool'
import type { NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent } from '@aemeath-projects/napcat/types'

import type { AccountRole, MessageRouter } from '@/core/accounts/index.js'
import type { ContextApis } from '@/core/dispatch/index.js'

/** `buildContextApis` 的函数签名，作为参数注入以便单测替换。 */
type BuildContextApis = (
  aggregated: AggregatedEvent<AnyOneBotEvent>,
  router: MessageRouter,
  pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>,
) => ContextApis

/**
 * 构造 `pool.on('event', ...)` 的回调：每个事件用独立 `traceId` 包裹整条
 * dispatch 链路，并显式 `.catch()` 记录未捕获异常，避免 fire-and-forget 导致
 * 进程级 `unhandledRejection`。
 */
export function createBotEventHandler(
  dispatcher: EventDispatcher<AnyOneBotEvent, ContextApis>,
  router: MessageRouter,
  pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>,
  log: Pick<PinoLogger, 'error'>,
  buildContextApis: BuildContextApis,
): (aggregated: AggregatedEvent<AnyOneBotEvent>) => void {
  return (aggregated) => {
    runWithTrace(randomUUID(), () => {
      dispatcher
        .dispatch(aggregated.event, buildContextApis(aggregated, router, pool))
        .catch((err: unknown) => {
          log.error({ err }, '事件分发未捕获异常')
        })
    })
  }
}
