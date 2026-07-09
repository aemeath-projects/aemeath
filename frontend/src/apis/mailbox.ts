/**
 * 站内信 API 接口层 —— 封装 /api/mailbox 所有后端接口调用。
 */

import { get, post } from './http'
import type { PaginatedResult } from './types'

export type { PaginatedResult } from './types'

export interface MailboxItem {
  id: string
  title: string
  content: string
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export interface MailboxListParams {
  page?: number
  pageSize?: number
  isRead?: boolean
}

const BASE = '/api/mailbox'

export async function fetchMailboxList(
  params: MailboxListParams,
): Promise<PaginatedResult<MailboxItem>> {
  const query: Record<string, string | number | boolean> = {}
  if (params.page) query.page = params.page
  if (params.pageSize) query.pageSize = params.pageSize
  if (params.isRead !== undefined) query.isRead = params.isRead
  return get<PaginatedResult<MailboxItem>>(BASE, query)
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  return get<{ count: number }>(`${BASE}/unread-count`)
}

export async function markAsRead(id: string): Promise<MailboxItem> {
  return post<MailboxItem>(`${BASE}/${id}/read`)
}

/**
 * 建立 SSE 连接，实时接收新到达的站内信。
 * @param onMessage 每次收到新站内信的回调
 * @param onError 连接错误回调
 * @returns 关闭连接的函数
 */
export function connectMailboxStream(
  onMessage: (item: MailboxItem) => void,
  onError?: (error: string) => void,
): () => void {
  const eventSource = new EventSource(`${BASE}/stream`)

  eventSource.onmessage = (event) => {
    try {
      const item: MailboxItem = JSON.parse(event.data)
      onMessage(item)
    } catch (e) {
      onError?.(`解析站内信推送失败: ${e}`)
    }
  }

  eventSource.onerror = () => {
    onError?.('站内信 SSE 连接断开，正在重连…')
  }

  return () => {
    eventSource.onmessage = null
    eventSource.onerror = null
    eventSource.close()
  }
}
