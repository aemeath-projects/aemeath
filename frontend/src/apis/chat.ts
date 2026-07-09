/**
 * Chat API 接口层 —— 封装 /api/iris 所有后端接口调用。
 */

import { get, post } from './http'

/* 类型定义 */

export type { PaginatedResult } from './types'

export interface ChatMessage {
  id: number
  messageId: number
  messageType: number
  groupId: string | null
  userId: string
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

const BASE = '/api/iris'

export async function fetchGroupMessages(
  groupId: string,
  params?: {
    before?: string
    limit?: number
    keyword?: string
    userId?: string
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
  return get<ChatMessage[]>(`${BASE}/messages/group/${groupId}`, query)
}

export async function fetchPrivateMessages(
  userId: string,
  params?: { before?: string; limit?: number },
): Promise<ChatMessage[]> {
  const query: Record<string, string | number> = {}
  if (params?.before) query.before = params.before
  if (params?.limit) query.limit = params.limit
  return get<ChatMessage[]>(`${BASE}/messages/private/${userId}`, query)
}

export async function fetchMessageContext(
  messageId: number,
  createdAt: string,
  context?: number,
): Promise<MessageContext> {
  const params: Record<string, string | number> = { createdAt }
  if (context) params.context = context
  return get<MessageContext>(`${BASE}/messages/${messageId}/context`, params)
}

export async function fetchArchives(
  page?: number,
  pageSize?: number,
): Promise<import('./types').PaginatedResult<ArchiveLog>> {
  const params: Record<string, number> = {}
  if (page) params.page = page
  if (pageSize) params.pageSize = pageSize
  return get(`${BASE}/archives`, params)
}

export async function triggerArchive(partitionName?: string): Promise<{ taskId: string }> {
  const body = partitionName ? { partitionName } : {}
  return post<{ taskId: string }>(`${BASE}/archives/trigger`, body)
}

export async function queryArchive(
  periodStart: string,
  groupId?: string,
  limit?: number,
): Promise<ChatMessage[]> {
  const params: Record<string, string | number> = { periodStart }
  if (groupId) params.groupId = groupId
  if (limit) params.limit = limit
  return get<ChatMessage[]>(`${BASE}/archives/query`, params)
}
