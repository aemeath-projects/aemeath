/**
 * 今日老婆 API 接口层 —— 封装 /api/jrlp 所有后端接口调用。
 */

import { get, post, put, del } from './http'
import type { PaginatedResult } from './types'

export type { PaginatedResult } from './types'

/* 类型定义 */

export interface WifeRecord {
  id: string
  groupId: string
  userId: string
  wifeQq: string
  date: string
  drawnAt: string | null
}

export interface ListRecordsParams {
  groupId?: string | null
  userId?: string | null
  date?: string | null
  page?: number
  pageSize?: number
}

export interface SetWifeRequest {
  groupId: string
  userId: string
  wifeQq: string
  date: string
}

export interface UpdateRecordRequest {
  id: string
  wifeQq: string
}

export interface DeleteRecordRequest {
  id: string
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
  return get<PaginatedResult<WifeRecord>>(`${BASE}/records`, query)
}

export async function setWife(body: SetWifeRequest): Promise<WifeRecord> {
  return post<WifeRecord>(`${BASE}/records`, body)
}

export async function updateRecord(body: UpdateRecordRequest): Promise<WifeRecord> {
  return put<WifeRecord>(`${BASE}/records/${body.id}`, { wifeQq: body.wifeQq })
}

export async function deleteRecord(body: DeleteRecordRequest): Promise<void> {
  await del<null>(`${BASE}/records/${body.id}`)
}
