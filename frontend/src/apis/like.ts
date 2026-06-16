/**
 * 点赞管理 API 接口层 —— 封装 /api/like 所有后端接口调用。
 */

import http from './client'
import type { ApiResponse, PaginatedResult } from './types'

/* 类型定义 */

export type LikeSource = 'manual' | 'scheduled'

export interface LikeTask {
  id: number
  qq: number
  registeredAt: string
  registeredGroupId: number | null
}

export interface LikeHistory {
  id: number
  qq: number
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
  qq?: number | null
  source?: LikeSource | null
  dateFrom?: string | null
  dateTo?: string | null
  page?: number
  pageSize?: number
}

/* API 调用 */

const BASE = '/api/like'

export async function listTasks(params: ListTasksParams = {}): Promise<PaginatedResult<LikeTask>> {
  const { data } = await http.get<ApiResponse<PaginatedResult<LikeTask>>>(`${BASE}/tasks`, {
    params,
  })
  return data.data
}

export async function createTask(qq: number): Promise<{ qq: number }> {
  const { data } = await http.post<ApiResponse<{ qq: number }>>(`${BASE}/tasks`, { qq })
  return data.data
}

export async function cancelTask(qq: number): Promise<{ qq: number }> {
  const { data } = await http.post<ApiResponse<{ qq: number }>>(`${BASE}/tasks/${qq}/cancel`)
  return data.data
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

  const { data } = await http.get<ApiResponse<PaginatedResult<LikeHistory>>>(`${BASE}/history`, {
    params: query,
  })
  return data.data
}
