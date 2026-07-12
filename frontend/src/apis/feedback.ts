/**
 * 用户反馈 API 接口层 —— 封装 /api/feedbacks 所有后端接口调用。
 */

import { get as httpGet, post } from './http'
import type { PaginatedResult } from './types'

export type { PaginatedResult } from './types'

/* 类型定义 */

export interface Feedback {
  id: string
  userId: string
  groupId: string | null
  content: string
  status: string
  feedbackType: string | null
  source: string
  adminReply: string | null
  createdAt: string
  updatedAt: string
  processedAt: string | null
}

export interface FeedbackListParams {
  page?: number
  pageSize?: number
  status?: string | null
  feedbackType?: string | null
  userId?: string | null
  source?: string | null
  search?: string | null
}

export interface UpdateStatusRequest {
  status: string
  adminReply?: string | null
}

/* API 调用 */

const BASE = '/api/feedbacks'

export async function list(params: FeedbackListParams): Promise<PaginatedResult<Feedback>> {
  const query: Record<string, string | number> = {}
  if (params.page) query.page = params.page
  if (params.pageSize) query.pageSize = params.pageSize
  if (params.status) query.status = params.status
  if (params.feedbackType) query.feedbackType = params.feedbackType
  if (params.userId) query.userId = params.userId
  if (params.source) query.source = params.source
  if (params.search) query.search = params.search
  return httpGet<PaginatedResult<Feedback>>(BASE, query)
}

export async function get(id: string): Promise<Feedback> {
  return httpGet<Feedback>(`${BASE}/${id}`)
}

export async function updateStatus(id: string, body: UpdateStatusRequest): Promise<void> {
  await post<null>(`${BASE}/${id}/status`, body)
}
