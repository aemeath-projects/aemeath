/**
 * 点赞管理 API 接口层 —— 封装 /api/like 所有后端接口调用。
 */

import { get, post } from './http'
import type { PaginatedResult } from './types'

/* 类型定义 */

export type LikeSource = 'manual' | 'scheduled'

export interface LikeTask {
  id: number
  qq: string
  registeredAt: string
  registeredGroupId: string | null
}

export interface LikeHistory {
  id: number
  qq: string
  times: number
  triggeredAt: string
  source: LikeSource
  success: boolean
}

export interface ListTasksParams {
  page?: number
  pageSize?: number
}

export interface ListHistoryParams {
  qq?: string | null
  source?: LikeSource | null
  dateFrom?: string | null
  dateTo?: string | null
  page?: number
  pageSize?: number
}

/* API 调用 */

const BASE = '/api/like'

export async function listTasks(params: ListTasksParams = {}): Promise<PaginatedResult<LikeTask>> {
  return get<PaginatedResult<LikeTask>>(`${BASE}/tasks`, params)
}

export async function createTask(qq: string): Promise<{ qq: string }> {
  return post<{ qq: string }>(`${BASE}/tasks`, { qq })
}

export async function cancelTask(qq: string): Promise<{ qq: string }> {
  return post<{ qq: string }>(`${BASE}/tasks/${qq}/cancel`)
}

export async function listHistory(
  params: ListHistoryParams = {},
): Promise<PaginatedResult<LikeHistory>> {
  const query: Record<string, string | number> = {}
  if (params.qq != null) query.qq = params.qq
  if (params.source) query.source = params.source
  if (params.dateFrom) query.dateFrom = params.dateFrom
  if (params.dateTo) query.dateTo = params.dateTo
  if (params.page != null) query.page = params.page
  if (params.pageSize != null) query.pageSize = params.pageSize
  return get<PaginatedResult<LikeHistory>>(`${BASE}/history`, query)
}
