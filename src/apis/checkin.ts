/**
 * 用户群签到管理 REST API —— /api/checkin。
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import {
  CheckinRecordsQuerySchema,
  CheckinLeaderboardQuerySchema,
  CheckinTrendQuerySchema,
  CheckinSummaryQuerySchema,
  PaginatedCheckinsResponseSchema,
  LeaderboardDataSchema,
  TrendDataSchema,
  SummaryResponseSchema,
  type CheckinRecordsQuery,
  type CheckinLeaderboardQuery,
  type CheckinTrendQuery,
  type CheckinSummaryQuery,
} from '@/apis/schemas/index.js'
import { ok, OkResponse } from '@/core/schemas/index.js'
import type { CheckinService, LeaderEntry, DayCount } from '@/services/checkin.js'

async function getCheckinSvc(app: FastifyInstance): Promise<CheckinService> {
  const { CheckinService: Cls } = await import('@/services/checkin.js')

  return app.services.getTyped(Cls, 'user_checkin_service')
}

/**
 * 签到管理路由插件。
 */
const checkinRoutes: FastifyPluginAsync = async (app) => {
  /** GET /api/checkin/records — 分页查询签到记录。 */
  app.get(
    '/api/checkin/records',
    {
      schema: {
        querystring: CheckinRecordsQuerySchema,
        response: { 200: OkResponse(PaginatedCheckinsResponseSchema) },
      },
    },
    async (req: FastifyRequest<{ Querystring: CheckinRecordsQuery }>, reply: FastifyReply) => {
      const svc = await getCheckinSvc(app)

      const groupId = req.query.groupId ? BigInt(req.query.groupId) : undefined
      const userId = req.query.userId ? BigInt(req.query.userId) : undefined
      const recordDate = req.query.date ? new Date(req.query.date) : undefined
      const page = req.query.page ?? 1
      const pageSize = req.query.pageSize ?? 20

      const [records, total] = await svc.listRecords({
        groupId,
        userId,
        recordDate,
        page,
        pageSize,
      })
      const pages = Math.ceil(total / pageSize)
      const items = records.map((r: Record<string, unknown>) => ({
        id: r.id,
        groupId: String(r.groupId),
        userId: String(r.userId),
        checkinDate:
          r.checkinDate instanceof Date
            ? r.checkinDate.toISOString().slice(0, 10)
            : String(r.checkinDate),
        checkinAt: r.checkinAt instanceof Date ? r.checkinAt.toISOString() : String(r.checkinAt),
      }))

      await reply.send(ok({ items, total, page, pageSize, pages }))
    },
  )

  /** GET /api/checkin/leaderboard — 查询排行榜（累计或连续）。 */
  app.get(
    '/api/checkin/leaderboard',
    {
      schema: {
        querystring: CheckinLeaderboardQuerySchema,
        response: { 200: OkResponse(LeaderboardDataSchema) },
      },
    },
    async (req: FastifyRequest<{ Querystring: CheckinLeaderboardQuery }>, reply: FastifyReply) => {
      const svc = await getCheckinSvc(app)

      const groupId = req.query.groupId ? BigInt(req.query.groupId) : undefined
      const by = req.query.by ?? 'total'
      const limit = req.query.limit ?? 20

      const entries: LeaderEntry[] = await svc.getLeaderboard({ groupId, by, limit })
      const result = entries.map((e, i) => ({
        rank: i + 1,
        userId: String(e.userId),
        value: e.value,
      }))

      await reply.send(ok(result))
    },
  )

  /** GET /api/checkin/trend — 查询最近 N 天每日签到人数趋势。 */
  app.get(
    '/api/checkin/trend',
    {
      schema: {
        querystring: CheckinTrendQuerySchema,
        response: { 200: OkResponse(TrendDataSchema) },
      },
    },
    async (req: FastifyRequest<{ Querystring: CheckinTrendQuery }>, reply: FastifyReply) => {
      const svc = await getCheckinSvc(app)

      const groupId = req.query.groupId ? BigInt(req.query.groupId) : undefined
      const days = req.query.days ?? 30

      const trend: DayCount[] = await svc.getDailyTrend({ groupId, days })
      await reply.send(ok(trend))
    },
  )

  /** GET /api/checkin/summary — 查询汇总卡片数据。 */
  app.get(
    '/api/checkin/summary',
    {
      schema: {
        querystring: CheckinSummaryQuerySchema,
        response: { 200: OkResponse(SummaryResponseSchema) },
      },
    },
    async (req: FastifyRequest<{ Querystring: CheckinSummaryQuery }>, reply: FastifyReply) => {
      const svc = await getCheckinSvc(app)

      const groupId = req.query.groupId ? BigInt(req.query.groupId) : undefined
      const summary = await svc.getSummary({ groupId })

      await reply.send(
        ok({
          totalCheckins: summary.totalCheckins,
          todayCheckins: summary.todayCheckins,
          activeUsers: summary.activeUsers,
        }),
      )
    },
  )
}

export default checkinRoutes
export { checkinRoutes }
