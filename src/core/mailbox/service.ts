/**
 * 站内信服务 —— 广播通知给全体管理员，并同步私聊提醒。
 */

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import { seg } from '@aemeath-projects/napcat'

import type { Mailbox } from '#prisma/aemeath'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'
import type { AdminService } from '@/core/user/index.js'

export type { Mailbox }

/** 广播站内信的入参。 */
export interface NotifyAdminsInput {
  /** 标题，写入站内信表 + 前端展示 */
  title: string
  /** Markdown 正文，写入站内信表 + 前端展示 */
  content: string
  /** 纯文本，用于同步私聊提醒；调用方单独编写，不做 Markdown 剥离 */
  notifyText: string
}

/** 查询站内信列表的入参。 */
export interface ListMailboxParams {
  recipientId: string
  page?: number
  pageSize?: number
  isRead?: boolean
}

/**
 * 站内信核心服务 —— 面向管理员的广播通知与已读状态管理。
 *
 * 通过 Startup 生命周期注册（见 bootstrap.ts），由 LifecycleOrchestrator 管理。
 */
export class MailboxService {
  private readonly _log: PinoLogger = getLogger('mailbox:service') as unknown as PinoLogger

  constructor(
    private readonly db: AemeathPrismaClient,
    private readonly router: MessageRouter,
    private readonly adminService: AdminService,
  ) {}

  /**
   * 广播站内信给所有管理员，并异步同步私聊通知（尽力而为，不阻塞方法返回）。
   */
  async notifyAdmins(input: NotifyAdminsInput): Promise<Mailbox[]> {
    const admins = await this.adminService.getAdmins()

    if (admins.length === 0) {
      this._log.warn('当前未设置御者，跳过站内信广播')
      return []
    }

    const messages = await this.db.$transaction(
      admins.map((admin) =>
        this.db.mailbox.create({
          data: {
            recipientId: admin.qq,
            title: input.title,
            content: input.content,
          },
        }),
      ),
    )

    // 异步同步私聊提醒（尽力而为，不阻塞返回；单个失败仅记录日志）
    const notifyTasks = admins.map(async (admin) => {
      try {
        await this.router.sendAdminMsg(admin.qq, [seg.text(`${input.title}\n${input.notifyText}`)])
      } catch (err: unknown) {
        this._log.warn({ adminQq: admin.qq, err }, '站内信私聊提醒发送失败')
      }
    })
    void Promise.allSettled(notifyTasks)

    return messages
  }

  /**
   * 分页查询指定收件人的站内信列表，支持按已读/未读筛选。
   */
  async listMessages(params: ListMailboxParams): Promise<[Mailbox[], number]> {
    const { recipientId, page = 1, pageSize = 20, isRead } = params

    const where = {
      recipientId,
      ...(isRead != null ? { isRead } : {}),
    }

    const [items, total] = await Promise.all([
      this.db.mailbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.mailbox.count({ where }),
    ])

    return [items, total]
  }

  /**
   * 查询指定收件人的未读数量。
   */
  async getUnreadCount(recipientId: string): Promise<number> {
    return this.db.mailbox.count({ where: { recipientId, isRead: false } })
  }

  /**
   * 标记单条站内信为已读（幂等）。不存在时返回 null。
   */
  async markRead(id: string): Promise<Mailbox | null> {
    const existing = await this.db.mailbox.findUnique({ where: { id } })
    if (existing === null) return null

    return this.db.mailbox.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    })
  }
}
