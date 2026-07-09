import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/core/mailbox/broadcast.js', () => ({
  mailboxBroadcaster: { broadcast: vi.fn() },
}))

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import { mailboxBroadcaster } from '@/core/mailbox/broadcast.js'
import { MailboxService } from '@/core/mailbox/service.js'
import type { AdminService } from '@/core/user/admin.js'

/* Mock 工厂 */

function createMockDb() {
  return {
    mailbox: {
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
    sendAdminMsg: vi.fn().mockResolvedValue({ status: 'ok', retcode: 0, data: null, echo: '' }),
  }
}

function createMockAdminService(adminQq: string | null = null) {
  return {
    getAdminQq: vi.fn().mockResolvedValue(adminQq),
  }
}

type MockDb = ReturnType<typeof createMockDb>
type MockRouter = ReturnType<typeof createMockRouter>
type MockAdminService = ReturnType<typeof createMockAdminService>

const baseMessage = {
  id: 'msg-1',
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
    it('无御者时仍应当写入一条站内信记录，不推送私聊', async () => {
      mockAdminService.getAdminQq.mockResolvedValue(null)
      mockDb.mailbox.create.mockResolvedValue(baseMessage)

      const result = await service.notifyAdmins({
        title: '标题',
        content: '内容',
        notifyText: '通知文本',
      })

      expect(result).toEqual(baseMessage)
      expect(mockDb.mailbox.create).toHaveBeenCalledWith({
        data: { title: '标题', content: '内容' },
      })

      // 等待异步分支（无御者分支不会调用 sendAdminMsg）
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(mockRouter.sendAdminMsg).not.toHaveBeenCalled()
    })

    it('有御者时应当写入一条站内信记录并异步推送私聊', async () => {
      mockAdminService.getAdminQq.mockResolvedValue('111')
      mockDb.mailbox.create.mockResolvedValue(baseMessage)

      const result = await service.notifyAdmins({
        title: '新反馈通知',
        content: '- 内容',
        notifyText: '纯文本通知',
      })

      expect(result).toEqual(baseMessage)
      expect(mockDb.mailbox.create).toHaveBeenCalledWith({
        data: { title: '新反馈通知', content: '- 内容' },
      })

      // 等待未 await 的私聊提醒微任务执行
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockRouter.sendAdminMsg).toHaveBeenCalledOnce()
      expect(mockRouter.sendAdminMsg).toHaveBeenCalledWith(
        '111',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            data: expect.objectContaining({ text: expect.stringContaining('新反馈通知') }),
          }),
        ]),
      )

      expect(mailboxBroadcaster.broadcast).toHaveBeenCalledWith(result)
    })

    it('私聊提醒发送失败时不应影响返回结果（不阻塞、不抛出）', async () => {
      mockAdminService.getAdminQq.mockResolvedValue('111')
      mockDb.mailbox.create.mockResolvedValue(baseMessage)
      mockRouter.sendAdminMsg.mockRejectedValue(new Error('主账号离线'))

      await expect(
        service.notifyAdmins({ title: '标题', content: '内容', notifyText: '通知文本' }),
      ).resolves.toEqual(baseMessage)
    })

    it('写库成功后应当无条件调用 mailboxBroadcaster.broadcast()（无论是否有御者）', async () => {
      mockAdminService.getAdminQq.mockResolvedValue(null)
      mockDb.mailbox.create.mockResolvedValue(baseMessage)

      const result = await service.notifyAdmins({
        title: '标题',
        content: '内容',
        notifyText: '通知文本',
      })

      expect(mailboxBroadcaster.broadcast).toHaveBeenCalledOnce()
      expect(mailboxBroadcaster.broadcast).toHaveBeenCalledWith(result)
    })
  })

  /* listMessages() */

  describe('listMessages()', () => {
    it('应当分页查询并返回 [items, total]', async () => {
      mockDb.mailbox.findMany.mockResolvedValue([baseMessage])
      mockDb.mailbox.count.mockResolvedValue(1)

      const [items, total] = await service.listMessages({ page: 1, pageSize: 20 })

      expect(items).toEqual([baseMessage])
      expect(total).toBe(1)
      expect(mockDb.mailbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      )
    })

    it('传入 isRead 时应当加入筛选条件', async () => {
      mockDb.mailbox.findMany.mockResolvedValue([])
      mockDb.mailbox.count.mockResolvedValue(0)

      await service.listMessages({ isRead: false })

      expect(mockDb.mailbox.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isRead: false } }),
      )
    })
  })

  /* getUnreadCount() */

  describe('getUnreadCount()', () => {
    it('应当按 isRead=false 统计', async () => {
      mockDb.mailbox.count.mockResolvedValue(3)

      const count = await service.getUnreadCount()

      expect(count).toBe(3)
      expect(mockDb.mailbox.count).toHaveBeenCalledWith({
        where: { isRead: false },
      })
    })
  })

  /* markRead() */

  describe('markRead()', () => {
    it('不存在时应当返回 null，不调用 update', async () => {
      mockDb.mailbox.findUnique.mockResolvedValue(null)

      const result = await service.markRead('non-existent')

      expect(result).toBeNull()
      expect(mockDb.mailbox.update).not.toHaveBeenCalled()
    })

    it('存在时应当标记已读并返回更新后的记录', async () => {
      mockDb.mailbox.findUnique.mockResolvedValue(baseMessage)
      const updated = { ...baseMessage, isRead: true, readAt: new Date() }
      mockDb.mailbox.update.mockResolvedValue(updated)

      const result = await service.markRead('msg-1')

      expect(mockDb.mailbox.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({ isRead: true, readAt: expect.any(Date) }),
      })
      expect(result).toEqual(updated)
    })

    it('重复调用应当幂等，不抛出错误', async () => {
      const alreadyRead = { ...baseMessage, isRead: true, readAt: new Date() }
      mockDb.mailbox.findUnique.mockResolvedValue(alreadyRead)
      mockDb.mailbox.update.mockResolvedValue(alreadyRead)

      await expect(service.markRead('msg-1')).resolves.toEqual(alreadyRead)
      await expect(service.markRead('msg-1')).resolves.toEqual(alreadyRead)
    })
  })
})
