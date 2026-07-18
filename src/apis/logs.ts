/**
 * 日志 SSE 端点 —— 实时推送应用日志到前端。
 */

import { logBroadcaster } from '@aemeath-projects/exostrider/logger'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

import { LogStreamQuerySchema } from '@/apis/schemas/index.js'
import { openSseConnection } from '@/core/utils/index.js'

/** Pino 日志级别数字 → 小写标签映射。 */
const PINO_LEVEL_LABELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
}

/**
 * 将 Pino 日志条目的 level 字段（数字或字符串）归一化为小写字符串标签。
 *
 * `logBroadcaster` 广播的是原始 Pino JSON，level 字段是数字（10/20/30/40/50/60），
 * 不能直接与查询参数（字符串）比较，需先归一化。
 */
export function normalizePinoLevel(rawLevel: unknown): string {
  if (typeof rawLevel === 'number') return PINO_LEVEL_LABELS[rawLevel] ?? ''
  if (typeof rawLevel === 'string') return rawLevel.toLowerCase()
  return ''
}

/**
 * 日志 SSE 路由插件。
 */
const logsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/logs — SSE 端点，实时推送应用日志。
   *
   * 客户端通过 query 参数 level 过滤日志级别（不区分大小写）。
   */
  app.get(
    '/api/logs',
    {
      schema: { querystring: LogStreamQuerySchema, hide: true },
    },
    async (req: FastifyRequest<{ Querystring: { level?: string } }>, reply: FastifyReply) => {
      const levelFilter = req.query.level?.toLowerCase()

      const onLog = (entry: Record<string, unknown>): void => {
        // 按级别过滤
        if (levelFilter !== undefined && levelFilter !== '') {
          if (normalizePinoLevel(entry.level) !== levelFilter) return
        }
        conn.send({ ...entry, level: normalizePinoLevel(entry.level) })
      }

      const conn = openSseConnection(req, reply, () => logBroadcaster.off('log', onLog))
      logBroadcaster.on('log', onLog)

      await conn.waitForClose()
    },
  )
}

export default logsRoutes
export { logsRoutes }
