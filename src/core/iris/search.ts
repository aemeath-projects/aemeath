/**
 * IrisSearchService —— 查询 archived_message_index 元数据表。
 * 支持按 groupId、userId、时间范围、关键词（pg_trgm 模糊搜索）查询。
 */
import type { IrisPrismaClient } from '@/core/db/index.js'

export interface SearchOptions {
  keyword?: string
  groupId?: bigint
  userId?: bigint
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

export interface SearchResult {
  id: bigint
  messageId: bigint
  groupId: bigint | null
  userId: bigint
  createdAt: Date
  senderNickname: string
  textSnippet: string
  archiveRef: string
}

export class IrisSearchService {
  constructor(private readonly irisDb: IrisPrismaClient) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { keyword, groupId, userId, startDate, endDate, limit = 50, offset = 0 } = options
    return this.irisDb.archivedMessageIndex.findMany({
      where: {
        ...(groupId !== undefined && { groupId }),
        ...(userId !== undefined && { userId }),
        ...(startDate !== undefined || endDate !== undefined
          ? {
              createdAt: {
                ...(startDate !== undefined && { gte: startDate }),
                ...(endDate !== undefined && { lte: endDate }),
              },
            }
          : {}),
        ...(keyword !== undefined && {
          textSnippet: { contains: keyword, mode: 'insensitive' },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })
  }

  async count(options: Omit<SearchOptions, 'limit' | 'offset'>): Promise<number> {
    const { keyword, groupId, userId, startDate, endDate } = options
    return this.irisDb.archivedMessageIndex.count({
      where: {
        ...(groupId !== undefined && { groupId }),
        ...(userId !== undefined && { userId }),
        ...(startDate !== undefined || endDate !== undefined
          ? {
              createdAt: {
                ...(startDate !== undefined && { gte: startDate }),
                ...(endDate !== undefined && { lte: endDate }),
              },
            }
          : {}),
        ...(keyword !== undefined && {
          textSnippet: { contains: keyword, mode: 'insensitive' },
        }),
      },
    })
  }
}
