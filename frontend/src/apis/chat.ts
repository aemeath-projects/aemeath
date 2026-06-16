/**
 * Chat API 接口层 —— 封装 /api/chat 所有后端接口调用。
 */

import http from './client'
import type { ApiResponse, PaginatedResult } from './types'

/* 类型定义 */

export type { PaginatedResult } from './types'

export interface ChatMessage {
  id: number
  messageId: number
  messageType: number
  groupId: number | null
  userId: number
  rawMessage: string
  segments: MessageSegment[]
  senderNickname: string
  senderCard: string | null
  senderRole: string | null
  createdAt: string | null
  storedAt: string | null
}

export interface MessageSegment {
  type: string
  data: Record<string, unknown>
}

export interface MessageContext {
  before: ChatMessage[]
  current: ChatMessage[]
  after: ChatMessage[]
}

export interface ArchiveLog {
  id: string
  partitionName: string
  periodStart: string
  periodEnd: string
  totalRows: number
  originalBytes: number
  compressedBytes: number
  s3Bucket: string
  s3Key: string
  status: string
  errorMessage: string | null
  createdAt: string | null
  completedAt: string | null
}

/* API 调用 */

const BASE = '/api/chat'

/* 消息查询 */

export async function fetchGroupMessages(
  groupId: number,
  params?: {
    before?: string
    limit?: number
    keyword?: string
    userId?: number
    startDate?: string
    endDate?: string
  },
): Promise<ChatMessage[]> {
  const query: Record<string, string | number> = {}
  if (params?.before) query.before = params.before
  if (params?.limit) query.limit = params.limit
  if (params?.keyword) query.keyword = params.keyword
  if (params?.userId) query.userId = params.userId
  if (params?.startDate) query.startDate = params.startDate
  if (params?.endDate) query.endDate = params.endDate
  const { data } = await http.get<ApiResponse<ChatMessage[]>>(`${BASE}/messages/group/${groupId}`, {
    params: query,
  })
  return data.data
}

export async function fetchPrivateMessages(
  userId: number,
  params?: { before?: string; limit?: number },
): Promise<ChatMessage[]> {
  const query: Record<string, string | number> = {}
  if (params?.before) query.before = params.before
  if (params?.limit) query.limit = params.limit
  const { data } = await http.get<ApiResponse<ChatMessage[]>>(
    `${BASE}/messages/private/${userId}`,
    { params: query },
  )
  return data.data
}

export async function fetchMessageContext(
  messageId: number,
  createdAt: string,
  context?: number,
): Promise<MessageContext> {
  const params: Record<string, string | number> = { createdAt }
  if (context) params.context = context
  const { data } = await http.get<ApiResponse<MessageContext>>(
    `${BASE}/messages/${messageId}/context`,
    { params },
  )
  return data.data
}

/* 归档管理 */

export async function fetchArchives(
  page?: number,
  pageSize?: number,
): Promise<PaginatedResult<ArchiveLog>> {
  const params: Record<string, number> = {}
  if (page) params.page = page
  if (pageSize) params.pageSize = pageSize
  const { data } = await http.get<ApiResponse<PaginatedResult<ArchiveLog>>>(`${BASE}/archives`, {
    params,
  })
  return data.data
}

export async function triggerArchive(partitionName?: string): Promise<{ taskId: string }> {
  const body = partitionName ? { partitionName } : {}
  const { data } = await http.post<ApiResponse<{ taskId: string }>>(
    `${BASE}/archives/trigger`,
    body,
  )
  return data.data
}

export async function queryArchive(
  periodStart: string,
  groupId?: number,
  limit?: number,
): Promise<ChatMessage[]> {
  const params: Record<string, string | number> = { periodStart }
  if (groupId) params.groupId = groupId
  if (limit) params.limit = limit
  const { data } = await http.get<ApiResponse<ChatMessage[]>>(`${BASE}/archives/query`, {
    params,
  })
  return data.data
}
