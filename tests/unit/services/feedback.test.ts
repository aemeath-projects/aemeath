import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import type { MailboxService } from '@/core/mailbox/index.js'
import { FeedbackService } from '@/services/feedback.js'

/* Mock 工厂 */

function createMockDb() {
  return {
    feedback: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  }
}

function createMockRouter() {
  return {
    sendGroupMsg: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
    sendAdminMsg: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
  }
}

function createMockMailbox() {
  return {
    notifyAdmins: vi.fn().mockResolvedValue([]),
  }
}

type MockDb = ReturnType<typeof createMockDb>
type MockRouter = ReturnType<typeof createMockRouter>
type MockMailbox = ReturnType<typeof createMockMailbox>

/* Tests */

describe('FeedbackService', () => {
  let mockDb: MockDb
  let mockRouter: MockRouter
  let mockMailbox: MockMailbox
  let service: FeedbackService

  beforeEach(() => {
    mockDb = createMockDb()
    mockRouter = createMockRouter()
    mockMailbox = createMockMailbox()
    service = new FeedbackService(
      mockDb as unknown as AemeathPrismaClient,
      mockRouter as unknown as MessageRouter,
      mockMailbox as unknown as MailboxService,
    )
    vi.clearAllMocks()
  })

  /* createFeedback() */

  describe('createFeedback()', () => {
    const baseFeedback = {
      id: 'test-uuid-1',
      userId: '123456',
      content: '这是一个 bug',
      source: 'group' as const,
      groupId: '987654',
      feedbackType: 'bug' as const,
      status: 'pending' as const,
      adminReply: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      processedAt: null,
    }

    it('应当调用 db.feedback.create() 并返回创建的反馈', async () => {
      mockDb.feedback.create.mockResolvedValue(baseFeedback)

      const result = await service.createFeedback({
        userId: '123456',
        content: '这是一个 bug',
        source: 'group',
        groupId: '987654',
        feedbackType: 'bug',
      })

      expect(mockDb.feedback.create).toHaveBeenCalledOnce()
      expect(mockDb.feedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: '123456',
          content: '这是一个 bug',
          source: 'group',
          status: 'pending',
        }),
      })
      expect(result).toEqual(baseFeedback)
    })

    it('应当调用 mailbox.notifyAdmins 广播反馈通知', async () => {
      mockDb.feedback.create.mockResolvedValue(baseFeedback)
      mockMailbox.notifyAdmins.mockResolvedValue([])

      await service.createFeedback({
        userId: '123456',
        content: '这是一个 bug',
        source: 'group',
        groupId: '987654',
        feedbackType: 'bug',
      })

      // 等待异步通知的微任务执行
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockMailbox.notifyAdmins).toHaveBeenCalledOnce()
      expect(mockMailbox.notifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '新反馈通知',
          content: expect.stringContaining(baseFeedback.id),
          notifyText: expect.stringContaining(baseFeedback.id),
        }),
      )
    })

    it('通知管理员失败时不应抛出错误', async () => {
      mockDb.feedback.create.mockResolvedValue(baseFeedback)
      // 通知管理员时抛出错误
      mockMailbox.notifyAdmins.mockRejectedValue(new Error('站内信服务异常'))

      // 不应抛出
      await expect(
        service.createFeedback({
          userId: '123456',
          content: '测试',
          source: 'private',
        }),
      ).resolves.toEqual(baseFeedback)
    })

    it('feedbackType 为 null 时应当使用 null', async () => {
      mockDb.feedback.create.mockResolvedValue({
        ...baseFeedback,
        feedbackType: null,
      })

      await service.createFeedback({
        userId: '123456',
        content: '无类型反馈',
        source: 'private',
      })

      expect(mockDb.feedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ feedbackType: null }),
      })
    })
  })

  /* updateStatus() */

  describe('updateStatus()', () => {
    const pendingFeedback = {
      id: 'test-uuid-2',
      userId: '111111',
      content: '反馈内容',
      source: 'private' as const,
      groupId: null,
      feedbackType: null,
      status: 'pending' as const,
      adminReply: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      processedAt: null,
    }

    const doneFeedback = {
      ...pendingFeedback,
      status: 'done' as const,
      adminReply: '已处理',
      processedAt: new Date(),
    }

    it('应当调用 db.feedback.update() 更新状态字段', async () => {
      mockDb.feedback.findUnique.mockResolvedValue(pendingFeedback)
      mockDb.feedback.update.mockResolvedValue(doneFeedback)

      const result = await service.updateStatus('test-uuid-2', 'done', '已处理')

      expect(mockDb.feedback.update).toHaveBeenCalledOnce()
      expect(mockDb.feedback.update).toHaveBeenCalledWith({
        where: { id: 'test-uuid-2' },
        data: expect.objectContaining({
          status: 'done',
          adminReply: '已处理',
        }),
      })
      expect(result).toEqual(doneFeedback)
    })

    it('反馈不存在时应当返回 null', async () => {
      mockDb.feedback.findUnique.mockResolvedValue(null)

      const result = await service.updateStatus('non-existent', 'done')

      expect(result).toBeNull()
      expect(mockDb.feedback.update).not.toHaveBeenCalled()
    })

    it('状态变为 done 时应当设置 processedAt', async () => {
      mockDb.feedback.findUnique.mockResolvedValue(pendingFeedback)
      mockDb.feedback.update.mockResolvedValue(doneFeedback)

      await service.updateStatus('test-uuid-2', 'done')

      expect(mockDb.feedback.update).toHaveBeenCalledWith({
        where: { id: 'test-uuid-2' },
        data: expect.objectContaining({
          processedAt: expect.any(Date),
        }),
      })
    })

    it('已是 done 状态时不应重复设置 processedAt', async () => {
      const alreadyDone = { ...pendingFeedback, status: 'done' as const }
      mockDb.feedback.findUnique.mockResolvedValue(alreadyDone)
      mockDb.feedback.update.mockResolvedValue(alreadyDone)

      await service.updateStatus('test-uuid-2', 'done')

      expect(mockDb.feedback.update).toHaveBeenCalledWith({
        where: { id: 'test-uuid-2' },
        data: expect.not.objectContaining({
          processedAt: expect.anything(),
        }),
      })
    })

    it('状态变为 done 时应当发送用户通知（不阻塞）', async () => {
      mockDb.feedback.findUnique.mockResolvedValue(pendingFeedback)
      mockDb.feedback.update.mockResolvedValue(doneFeedback)

      await service.updateStatus('test-uuid-2', 'done', '已处理')

      // 等待通知的微任务执行
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockRouter.sendAdminMsg).toHaveBeenCalledOnce()
      expect(mockRouter.sendAdminMsg).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            data: expect.objectContaining({ text: expect.stringContaining('反馈已处理完成') }),
          }),
        ]),
      )
    })
  })

  /* listFeedbacks() */

  describe('listFeedbacks()', () => {
    it('应当调用 findMany 和 count 并返回 PageResult', async () => {
      const fakeFeedbacks = [
        {
          id: 'f1',
          userId: '100',
          content: '测试',
          source: 'group' as const,
          status: 'pending' as const,
          feedbackType: null,
          groupId: null,
          adminReply: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          processedAt: null,
        },
      ]
      mockDb.feedback.findMany.mockResolvedValue(fakeFeedbacks)
      mockDb.feedback.count.mockResolvedValue(1)

      const [items, total] = await service.listFeedbacks({
        status: 'pending',
        page: 1,
        pageSize: 10,
      })

      expect(items).toEqual(fakeFeedbacks)
      expect(total).toBe(1)
      expect(mockDb.feedback.findMany).toHaveBeenCalledOnce()
    })
  })

  /* getUserFeedbacks() */

  describe('getUserFeedbacks()', () => {
    it('应当按 userId 查询最近 N 条反馈', async () => {
      mockDb.feedback.findMany.mockResolvedValue([])

      await service.getUserFeedbacks('12345', 5)

      expect(mockDb.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: '12345' },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      )
    })
  })
})
