/**
 * Mailbox 领域 TypeBox 请求/响应 Schema 定义。
 */

import { type Static, Type } from '@sinclair/typebox'

/* 路径参数 */

/** 站内信 ID 路径参数 —— UUID 格式。 */
export const MailboxIdParamSchema = Type.Object({
  id: Type.String({
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    description: '站内信 UUID',
  }),
})

/* 查询参数（Querystring） */

/** 分页查询站内信列表 —— GET /api/mailbox */
export const MailboxListQuerySchema = Type.Object({
  recipientId: Type.String({ pattern: '^\\d+$', description: '收件人 QQ 号' }),
  page: Type.Optional(Type.String({ pattern: '^\\d+$', description: '页码（默认 1）' })),
  pageSize: Type.Optional(
    Type.String({ pattern: '^\\d+$', description: '每页条数（默认 20，最大 100）' }),
  ),
  isRead: Type.Optional(
    Type.Union([Type.Literal('true'), Type.Literal('false')], {
      description: '是否已读筛选：true / false',
    }),
  ),
})

/** 查询未读数量 —— GET /api/mailbox/unread-count */
export const UnreadCountQuerySchema = Type.Object({
  recipientId: Type.String({ pattern: '^\\d+$', description: '收件人 QQ 号' }),
})

/* 响应数据 Schema */

/**
 * 站内信详情 Schema —— 对应 MailboxMessage 序列化后的 DTO。
 *
 * recipientId 为 BigInt 字段，序列化为字符串返回（比照 src/apis/feedback.ts 的
 * feedbackToDict() 对 userId 的处理惯例），故此处声明为 Type.String()。
 */
export const MailboxSchema = Type.Object({
  id: Type.String({ description: '站内信 ID' }),
  recipientId: Type.String({ description: '收件人 QQ 号（字符串形式）' }),
  title: Type.String({ description: '标题' }),
  content: Type.String({ description: '内容（Markdown）' }),
  isRead: Type.Boolean({ description: '是否已读' }),
  readAt: Type.Union([Type.String(), Type.Null()], { description: '已读时间（ISO 字符串）' }),
  createdAt: Type.String({ description: '创建时间（ISO 字符串）' }),
})

/** 分页站内信列表响应数据 Schema —— GET /api/mailbox */
export const PaginatedMailboxDataSchema = Type.Object({
  items: Type.Array(MailboxSchema),
  total: Type.Number(),
  page: Type.Number(),
  pageSize: Type.Number(),
  pages: Type.Number(),
})

/** 未读数量响应数据 Schema —— GET /api/mailbox/unread-count */
export const UnreadCountDataSchema = Type.Object({
  count: Type.Number({ description: '未读数量' }),
})

/* 静态类型推导 */

export type MailboxListQuery = Static<typeof MailboxListQuerySchema>
export type UnreadCountQuery = Static<typeof UnreadCountQuerySchema>
