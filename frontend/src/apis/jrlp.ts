/**
 * 今日老婆 API 接口层 —— 封装 /api/jrlp 所有后端接口调用。
 */

import http from './client'
import type { ApiResponse, PaginatedResult } from './types'

/* 类型定义 */

export interface WifeRecord {
  id: number
  groupId: number
  userId: number
  wifeQq: number
  date: string
  drawnAt: string | null
}

export interface ListRecordsParams {
  groupId?: number | null
  userId?: number | null
  date?: string | null
  page?: number
  pageSize?: number
}

export interface SetWifeRequest {
  groupId: number
  userId: number
  wifeQq: number
  date: string
}

export interface UpdateRecordRequest {
  id: number
  wifeQq: number
}

export interface DeleteRecordRequest {
  id: number
}

/* API 调用 */

const BASE = '/api/jrlp'

export async function listRecords(params: ListRecordsParams): Promise<PaginatedResult<WifeRecord>> {
  const query: Record<string, string | number> = {}
  if (params.groupId != null) query.groupId = params.groupId
  if (params.userId != null) query.userId = params.userId
  if (params.date) query.date = params.date
  if (params.page) query.page = params.page
  if (params.pageSize) query.pageSize = params.pageSize

  const { data } = await http.get<ApiResponse<PaginatedResult<WifeRecord>>>(`${BASE}/records`, {
    params: query,
  })
  return data.data
}

export async function setWife(body: SetWifeRequest): Promise<WifeRecord> {
  const { data } = await http.post<ApiResponse<WifeRecord>>(`${BASE}/records/create`, body)
  return data.data
}

export async function updateRecord(body: UpdateRecordRequest): Promise<WifeRecord> {
  const { data } = await http.post<ApiResponse<WifeRecord>>(`${BASE}/records/update`, body)
  return data.data
}

export async function deleteRecord(body: DeleteRecordRequest): Promise<void> {
  await http.post<ApiResponse<null>>(`${BASE}/records/delete`, body)
}
