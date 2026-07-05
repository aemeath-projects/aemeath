/**
 * 站内信模块生命周期注册 —— 创建 MailboxService 并暴露给其他服务复用。
 */

import { Service, Inject, Provide, Startup } from '@aemeath-projects/exostrider/lifecycle'

import { MailboxService } from './service.js'

import type { MessageRouter } from '@/core/accounts/index.js'
import type { AemeathPrismaClient } from '@/core/db/index.js'

@Service({ name: 'mailbox_bootstrap' })
export class MailboxBootstrap {
  /** 注入主数据库 */
  @Inject('db')
  db!: AemeathPrismaClient

  /** 注入消息路由器 */
  @Inject('message_router')
  router!: MessageRouter

  /** 对外暴露站内信服务实例，供其他服务（如 FeedbackService）通过 @Inject('mailbox') 复用 */
  @Provide('mailbox')
  mailboxService!: MailboxService

  @Startup
  start(): void {
    this.mailboxService = new MailboxService(this.db, this.router)
  }
}
