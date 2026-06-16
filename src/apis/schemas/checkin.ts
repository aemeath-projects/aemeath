/**
 * 用户群签到 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/* 请求 Schema */

/** 签到记录列表查询参数 Schema。 */
export const CheckinRecordsQuerySchema = Type.Object({
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  userId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  date: Type.Optional(Type.String({ description: 'YYYY-MM-DD' })),
  page: Type.Optional(Type.Number({ default: 1, minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ default: 20, minimum: 1, maximum: 100 })),
})

/** 排行榜查询参数 Schema。 */
export const CheckinLeaderboardQuerySchema = Type.Object({
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  by: Type.Optional(Type.Union([Type.Literal('total'), Type.Literal('streak')])),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
})

/** 每日趋势查询参数 Schema。 */
export const CheckinTrendQuerySchema = Type.Object({
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
  days: Type.Optional(Type.Number({ minimum: 1, maximum: 365, default: 30 })),
})

/** 汇总数据查询参数 Schema。 */
export const CheckinSummaryQuerySchema = Type.Object({
  groupId: Type.Optional(Type.String({ pattern: '^\\d+$' })),
})

/* TypeScript 接口 */

export interface CheckinRecordsQuery {
  groupId?: string
  userId?: string
  date?: string
  page?: number
  pageSize?: number
}

export interface CheckinLeaderboardQuery {
  groupId?: string
  by?: 'total' | 'streak'
  limit?: number
}

export interface CheckinTrendQuery {
  groupId?: string
  days?: number
}

export interface CheckinSummaryQuery {
  groupId?: string
}

/* 响应 Schema */

/** 单条签到记录响应 Schema。 */
export const CheckinRecordResponseSchema = Type.Object({
  id: Type.Number(),
  groupId: Type.String(),
  userId: Type.String(),
  checkinDate: Type.String({ description: 'ISO date string' }),
  checkinAt: Type.String({ description: 'ISO datetime string' }),
})

/** 分页签到记录响应 Schema。 */
export const PaginatedCheckinsResponseSchema = Type.Object({
  items: Type.Array(CheckinRecordResponseSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  pages: Type.Number(),
})

/** 排行榜条目 Schema。 */
export const LeaderEntryResponseSchema = Type.Object({
  rank: Type.Number(),
  userId: Type.String(),
  value: Type.Number({ description: '累计天数或连续天数，由请求 by 参数决定' }),
})

/** 每日签到人数数据点 Schema。 */
export const DayCountResponseSchema = Type.Object({
  date: Type.String(),
  count: Type.Number(),
})

/** 排行榜列表响应数据 Schema —— GET /api/checkin/leaderboard */
export const LeaderboardDataSchema = Type.Array(LeaderEntryResponseSchema)

/** 每日趋势列表响应数据 Schema —— GET /api/checkin/trend */
export const TrendDataSchema = Type.Array(DayCountResponseSchema)
export const SummaryResponseSchema = Type.Object({
  totalCheckins: Type.Number(),
  todayCheckins: Type.Number(),
  activeUsers: Type.Number(),
})
