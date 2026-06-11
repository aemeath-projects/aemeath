/** 每日打卡 BullMQ 处理器 —— Worker 内完成预处理，返回 BotApiCall[]。 */

import type { Job } from 'bullmq'

import type { CacheClient } from '@/core/cache/client.js'
import { checkinDailyKey } from '@/core/cache/key-registry.js'
import type { MainPrismaClient } from '@/core/db/client.js'
import type { MinimalSettingSchema } from '@/core/settings/query.js'
import { getSettingValue } from '@/core/settings/query.js'
import type { BotActionJobResult } from '@/core/tasks/models.js'

export const JOB_NAME = 'daily-checkin' as const

export interface CheckinWorkerDeps {
  db: MainPrismaClient
  cache: CacheClient
  schemaMap: ReadonlyMap<string, MinimalSettingSchema>
}

export async function dailyCheckinProcessor(
  _job: Job,
  deps: CheckinWorkerDeps,
): Promise<BotActionJobResult> {
  const { db, cache, schemaMap } = deps
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())

  const groups = await db.group.findMany({
    where: { isActive: true },
    select: { groupId: true },
  })

  const calls: { method: string; args: unknown[] }[] = []

  for (const g of groups) {
    const botEnabled = await getSettingValue<boolean>('bot.enabled', {
      db,
      schemaMap,
      group: g.groupId,
    })
    if (!botEnabled) continue

    const featureEnabled = await getSettingValue<boolean>('daily_checkin.enabled', {
      db,
      schemaMap,
      group: g.groupId,
    })
    if (!featureEnabled) continue

    if (await cache.exists(checkinDailyKey(g.groupId, today))) continue

    calls.push({ method: 'sendGroupSign', args: [Number(g.groupId)] })
  }

  return { type: 'bot-action', calls }
}
