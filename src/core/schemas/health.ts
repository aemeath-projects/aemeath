/**
 * 健康检查 API 响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 健康检查响应数据 Schema —— GET /health */
export const HealthDataSchema = Type.Object({
  status: Type.String(),
  version: Type.String(),
  wsConnected: Type.Boolean(),
})
