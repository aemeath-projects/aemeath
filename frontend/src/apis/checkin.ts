/**
 * 用户群签到 API 接口层 —— 封装 /api/checkin 所有后端接口调用。
 */

import { get } from './http'
import type { PaginatedResult } from './types'

/* 类型定义 */

export interface CheckinRecord {
  id: number
  groupId: number
  userId: number
  checkinDate: string
  checkinAt: string
}

export interface LeaderEntry {
  rank: number
  userId: number
  value: number
}

export interface DayCount {
  date: string
  count: number
}

export interface Summary {
  totalCheckins: number
  todayCheckins: number
  activeUsers: number
}

export interface ListRecordsParams {
  groupId?: number | null
  userId?: number | null
  date?: string | null
  page?: number
  pageSize?: number
}

/* API 调用 */

const BASE = '/api/checkin'

export async function listRecords(
  params: ListRecordsParams,
): Promise<PaginatedResult<CheckinRecord>> {
  const query: Record<string, string | number> = {}
  if (params.groupId != null) query.groupId = params.groupId
  if (params.userId != null) query.userId = params.userId
  if (params.date) query.date = params.date
  if (params.page) query.page = params.page
  if (params.pageSize) query.pageSize = params.pageSize
  return get<PaginatedResult<CheckinRecord>>(`${BASE}/records`, query)
}

export async function getLeaderboard(
  groupId: number | null | undefined,
  by: 'total' | 'streak' = 'total',
  limit = 20,
): Promise<LeaderEntry[]> {
  const params: Record<string, string | number> = { by, limit }
  if (groupId != null) params.groupId = groupId
  return get<LeaderEntry[]>(`${BASE}/leaderboard`, params)
}

export async function getDailyTrend(
  groupId: number | null | undefined,
  days = 30,
): Promise<DayCount[]> {
  const params: Record<string, string | number> = { days }
  if (groupId != null) params.groupId = groupId
  return get<DayCount[]>(`${BASE}/trend`, params)
}

export async function getSummary(groupId: number | null | undefined): Promise<Summary> {
  const params: Record<string, string | number> = {}
  if (groupId != null) params.groupId = groupId
  return get<Summary>(`${BASE}/summary`, params)
}
