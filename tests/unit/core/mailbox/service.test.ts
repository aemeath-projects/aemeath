import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import { MailboxService } from '@/core/mailbox/service.js'
import type { AdminService } from '@/core/user/admin.js'

/* Mock 工厂 */

function createMockDb() {
  return {
    mailboxMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}

function createMockRouter() {
  return {
    sendAdminMsg: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
  }
}

function createMockAdminService(
  admins: { qq: string; nickname: string; relation: string; lastSynced: string | null }[] = [],
) {
  return {
    getAdmins: vi.fn().mockResolvedValue(admins),
  }
}

type MockDb = ReturnType<typeof createMockDb>
type MockRouter = ReturnType<typeof createMockRouter>
type MockAdminService = ReturnType<typeof createMockAdminService>

const admin1 = { qq: '111', nickname: '管理员甲', relation: 'admin' as const, lastSynced: null }
const admin2 = { qq: '222', nickname: '管理员乙', relation: 'admin' as const, lastSynced: null }

const baseMessage = {
  id: 'msg-1',
  recipientId: '111',
  title: '新反馈通知',
  content: '内容',
  isRead: false,
  readAt: null,
  createdAt: new Date(),
}

describe('MailboxService', () => {
  let mockDb: MockDb
  let mockRouter: MockRouter
  let mockAdminService: MockAdminService
  let service: MailboxService

  beforeEach(() => {
    mockDb = createMockDb()
    mockRouter = createMockRouter()
    mockAdminService = createMockAdminService()
    service = new MailboxService(
      mockDb as unknown as AemeathPrismaClient,
      mockRouter as unknown as MessageRouter,
      mockAdminService as unknown as AdminService,
    )
    vi.clearAllMocks()
  })

  /* notifyAdmins() */

  describe('notifyAdmins()', () => {
    it('无管理员时应当返回空数组，不写库', async () => {
      mockAdminService.getAdmins.mockResolvedValue([])

      const result = await service.notifyAdmins({
        title: '标题',
        content: '内容',
        notifyText: '通知文本',
      })

      expect(result).toEqual([])
      expect(mockDb.$transaction).not.toHaveBeenCalled()
    })

    it('应当为每个管理员创建一条站内信并返回创建的记录', async () => {
      mockAdminService.getAdmins.mockResolvedValue([admin1, admin2])
      const created1 = { ...baseMessage, id: 'msg-1', recipientId: '111' }
      const created2 = { ...baseMessage, id: 'msg-2', recipientId: '222' }
      mockDb.$transaction.mockResolvedValue([created1, created2])

      const result = await service.notifyAdmins({
        title: '新反馈通知',
        content: '- 内容',
        notifyText: '纯文本通知',
      })

      expect(mockAdminService.getAdmins).toHaveBeenCalledOnce()
      expect(mockDb.$transaction).toHaveBeenCalledOnce()
      expect(result).toEqual([created1, created2])
    })

    it('私聊提醒发送失败时不应影响返回结果（不阻塞、不抛出）', async () => {
      mockAdminService.getAdmins.mockResolvedValue([admin1])
      const created = { ...baseMessage }
      mockDb.$transaction.mockResolvedValue([created])
      mockRouter.sendAdminMsg.mockRejectedValue(new Error('主账号离线'))

      await expect(
        service.notifyAdmins({ title: '标题', content: '内容', notifyText: '通知文本' }),
      ).resolves.toEqual([created])
    })

    it('应当异步同步私聊提醒给每个管理员', async () => {
      mockAdminService.getAdmins.mockResolvedValue([admin1, admin2])
      mockDb.$transaction.mockResolvedValue([
        { ...baseMessage, id: 'msg-1', recipientId: '111' },
        { ...baseMessage, id: 'msg-2', recipientId: '222' },
      ])

      await service.notifyAdmins({ title: '标题', content: '内容', notifyText: '通知文本' })

      // 等待未 await 的私聊提醒微任务执行
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockRouter.sendAdminMsg).toHaveBeenCalledTimes(2)
      expect(mockRouter.sendAdminMsg).toHaveBeenCalledWith(
        '111',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            data: expect.objectContaining({ text: expect.stringContaining('标题') }),
          }),
        ]),
      )
    })
  })

  /* listMessages() */

  describe('listMessages()', () => {
    it('应当按 recipientId 分页查询并返回 [items, total]', async () => {
      mockDb.mailboxMessage.findMany.mockResolvedValue([baseMessage])
      mockDb.mailboxMessage.count.mockResolvedValue(1)

      const [items, total] = await service.listMessages({
        recipientId: '111',
        page: 1,
        pageSize: 20,
      })

      expect(items).toEqual([baseMessage])
      expect(total).toBe(1)
      expect(mockDb.mailboxMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipientId: '111' },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      )
    })

    it('传入 isRead 时应当加入筛选条件', async () => {
      mockDb.mailboxMessage.findMany.mockResolvedValue([])
      mockDb.mailboxMessage.count.mockResolvedValue(0)

      await service.listMessages({ recipientId: '111', isRead: false })

      expect(mockDb.mailboxMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recipientId: '111', isRead: false } }),
      )
    })
  })

  /* getUnreadCount() */

  describe('getUnreadCount()', () => {
    it('应当按 recipientId + isRead=false 统计', async () => {
      mockDb.mailboxMessage.count.mockResolvedValue(3)

      const count = await service.getUnreadCount('111')

      expect(count).toBe(3)
      expect(mockDb.mailboxMessage.count).toHaveBeenCalledWith({
        where: { recipientId: '111', isRead: false },
      })
    })
  })

  /* markRead() */

  describe('markRead()', () => {
    it('不存在时应当返回 null，不调用 update', async () => {
      mockDb.mailboxMessage.findUnique.mockResolvedValue(null)

      const result = await service.markRead('non-existent')

      expect(result).toBeNull()
      expect(mockDb.mailboxMessage.update).not.toHaveBeenCalled()
    })

    it('存在时应当标记已读并返回更新后的记录', async () => {
      mockDb.mailboxMessage.findUnique.mockResolvedValue(baseMessage)
      const updated = { ...baseMessage, isRead: true, readAt: new Date() }
      mockDb.mailboxMessage.update.mockResolvedValue(updated)

      const result = await service.markRead('msg-1')

      expect(mockDb.mailboxMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      })
      expect(result).toEqual(updated)
    })

    it('重复调用应当幂等，不抛出错误', async () => {
      const alreadyRead = { ...baseMessage, isRead: true, readAt: new Date() }
      mockDb.mailboxMessage.findUnique.mockResolvedValue(alreadyRead)
      mockDb.mailboxMessage.update.mockResolvedValue(alreadyRead)

      await expect(service.markRead('msg-1')).resolves.toEqual(alreadyRead)
      await expect(service.markRead('msg-1')).resolves.toEqual(alreadyRead)
    })
  })
})
