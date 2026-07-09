/**
 * 日志 SSE API 请求/响应 Schema（TypeBox）。
 *
 * 覆盖 SSE 实时推送端点的查询参数校验。
 */

import { Type } from '@sinclair/typebox'

/** 日志 SSE 流查询参数 —— GET /api/logs */
export const LogStreamQuerySchema = Type.Object({
  level: Type.Optional(
    Type.String({ description: '日志级别过滤，不区分大小写（如 debug/info/warn/error）' }),
  ),
})
