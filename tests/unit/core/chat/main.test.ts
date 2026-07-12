import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IrisPrismaClient } from '@/core/db/index.js'
import { IrisService, irisMessageBroadcaster } from '@/core/iris/index.js'

/** 创建 chatDb mock。 */
function createMockChatDb() {
  return {
    chatMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    $disconnect: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $queryRaw: vi.fn(),
  }
}

type MockChatDb = ReturnType<typeof createMockChatDb>

describe('IrisService', () => {
  let mockChatDb: MockChatDb
  let service: IrisService

  beforeEach(() => {
    mockChatDb = createMockChatDb()
    service = new IrisService(mockChatDb as unknown as IrisPrismaClient)
  })

  /* saveMessage */

  describe('saveMessage', () => {
    it('应当调用 chatDb.chatMessage.create() 持久化消息', async () => {
      mockChatDb.chatMessage.create.mockResolvedValue({})

      await service.saveMessage({
        messageId: 1001n,
        messageType: 2,
        groupId: '123456',
        userId: '987654',
        rawMessage: '你好',
        segments: [{ type: 'text', data: { text: '你好' } }],
        senderNickname: '测试用户',
        senderCard: null,
        senderRole: 'member',
        createdAt: new Date('2024-01-01T12:00:00Z'),
      })

      expect(mockChatDb.chatMessage.create).toHaveBeenCalledOnce()
      expect(mockChatDb.chatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 1001n,
          messageType: 2,
          groupId: '123456',
          userId: '987654',
          rawMessage: '你好',
          senderNickname: '测试用户',
        }),
      })
    })

    it('持久化失败时应当吞掉错误不抛出', async () => {
      mockChatDb.chatMessage.create.mockRejectedValue(new Error('DB 连接失败'))

      await expect(
        service.saveMessage({
          messageId: 1002n,
          messageType: 1,
          userId: '111',
          rawMessage: '测试',
          segments: [],
          senderNickname: '用户',
          createdAt: new Date(),
        }),
      ).resolves.toBeUndefined()
    })

    it('groupId 为 undefined 时应当写入 null', async () => {
      mockChatDb.chatMessage.create.mockResolvedValue({})

      await service.saveMessage({
        messageId: 2001n,
        messageType: 1,
        groupId: undefined,
        userId: '555',
        rawMessage: '私聊消息',
        segments: [],
        senderNickname: '私聊用户',
        createdAt: new Date(),
      })

      expect(mockChatDb.chatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ groupId: null }),
      })
    })

    it('持久化成功后应当调用 irisMessageBroadcaster.broadcast() 广播新消息', async () => {
      const created = {
        id: 1n,
        messageId: 3001n,
        messageType: 2,
        groupId: '123456',
        userId: '987654',
        rawMessage: '广播测试',
        segments: [],
        senderNickname: '测试用户',
        senderCard: null,
        senderRole: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        storedAt: new Date('2024-01-01T12:00:01Z'),
      }
      mockChatDb.chatMessage.create.mockResolvedValue(created)
      const broadcastSpy = vi
        .spyOn(irisMessageBroadcaster, 'broadcast')
        .mockImplementation(() => {})

      await service.saveMessage({
        messageId: 3001n,
        messageType: 2,
        groupId: '123456',
        userId: '987654',
        rawMessage: '广播测试',
        segments: [],
        senderNickname: '测试用户',
        senderCard: null,
        senderRole: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
      })

      expect(broadcastSpy).toHaveBeenCalledOnce()
      expect(broadcastSpy).toHaveBeenCalledWith(created)
      broadcastSpy.mockRestore()
    })

    it('持久化失败时不应调用 broadcast()', async () => {
      mockChatDb.chatMessage.create.mockRejectedValue(new Error('DB 连接失败'))
      const broadcastSpy = vi
        .spyOn(irisMessageBroadcaster, 'broadcast')
        .mockImplementation(() => {})

      await service.saveMessage({
        messageId: 3002n,
        messageType: 1,
        userId: '111',
        rawMessage: '测试',
        segments: [],
        senderNickname: '用户',
        createdAt: new Date(),
      })

      expect(broadcastSpy).not.toHaveBeenCalled()
      broadcastSpy.mockRestore()
    })
  })

  /* getGroupHistory */

  describe('getGroupHistory', () => {
    const fakeMessages = [
      {
        id: 1n,
        createdAt: new Date('2024-06-01'),
        messageId: 100n,
        messageType: 2,
        groupId: '888',
        userId: '999',
        rawMessage: '群消息',
        segments: [],
        senderNickname: '群友',
        senderCard: null,
        senderRole: 'member',
        storedAt: new Date(),
      },
    ]

    it('应当按 groupId 查询并按 createdAt desc 排序', async () => {
      mockChatDb.chatMessage.findMany.mockResolvedValue(fakeMessages)

      const result = await service.getGroupHistory('888')

      expect(mockChatDb.chatMessage.findMany).toHaveBeenCalledOnce()

      interface FindManyArg {
        where: { groupId: string }
        orderBy: { createdAt: string }
        take: number
      }
      const callArg = mockChatDb.chatMessage.findMany.mock.calls[0]?.[0] as FindManyArg
      expect(callArg.where.groupId).toBe('888')
      expect(callArg.orderBy.createdAt).toBe('desc')
      expect(callArg.take).toBe(50) // 默认 limit

      expect(result).toEqual(fakeMessages)
    })

    it('传入 limit 时应当使用指定值', async () => {
      mockChatDb.chatMessage.findMany.mockResolvedValue([])

      await service.getGroupHistory('888', { limit: 20 })

      interface FindManyArg {
        take: number
      }
      const callArg = mockChatDb.chatMessage.findMany.mock.calls[0]?.[0] as FindManyArg
      expect(callArg.take).toBe(20)
    })

    it('传入 before 时应当添加 lt 时间过滤，且默认携带 30 天下界防止全表扫描', async () => {
      mockChatDb.chatMessage.findMany.mockResolvedValue([])
      const before = new Date('2024-05-01')

      await service.getGroupHistory('888', { before })

      interface FindManyArg {
        where: { createdAt?: { lt?: Date; gte?: Date } }
      }
      const callArg = mockChatDb.chatMessage.findMany.mock.calls[0]?.[0] as FindManyArg
      expect(callArg.where.createdAt?.lt).toEqual(before)
      // gte 下界基于 Date.now() 计算，允许合理的时间误差
      expect(callArg.where.createdAt?.gte?.getTime()).toBeCloseTo(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
        -3,
      )
    })
  })

  /* getPrivateHistory */

  describe('getPrivateHistory', () => {
    it('应当按 userId 和 messageType=1 查询', async () => {
      mockChatDb.chatMessage.findMany.mockResolvedValue([])

      await service.getPrivateHistory('12345')

      interface FindManyArg {
        where: { userId: string; messageType: number }
      }
      const callArg = mockChatDb.chatMessage.findMany.mock.calls[0]?.[0] as FindManyArg
      expect(callArg.where.userId).toBe('12345')
      expect(callArg.where.messageType).toBe(1)
    })
  })
})
