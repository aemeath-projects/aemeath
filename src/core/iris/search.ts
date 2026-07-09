/**
 * IrisSearchService —— 归档消息搜索服务。
 * TODO(Task 7): 基于新的 ArchiveLog 结构重新实现搜索逻辑。
 */

export interface SearchOptions {
  keyword?: string
  groupId?: string
  userId?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

export interface SearchResult {
  id: string
  messageId: string
  groupId: string | null
  userId: string
  createdAt: Date
  senderNickname: string
  textSnippet: string
  archiveRef: string
}

export class IrisSearchService {
  // TODO(Task 7): 重新实现搜索逻辑，archivedMessageIndex 模型已从 iris schema 中移除
  async search(_options: SearchOptions): Promise<SearchResult[]> {
    return []
  }

  async count(_options: Omit<SearchOptions, 'limit' | 'offset'>): Promise<number> {
    return 0
  }
}
