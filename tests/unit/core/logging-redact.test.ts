import { createLogger, logBroadcaster } from '@aemeath-projects/exostrider/logger'
import { describe, it, expect } from 'vitest'

import { LOG_REDACT_PATHS } from '@/core/logging-redact.js'

describe('LOG_REDACT_PATHS', () => {
  it('覆盖 token、password、Authorization 请求头等敏感路径', () => {
    expect(LOG_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'token',
        '*.token',
        'password',
        '*.password',
        'req.headers.authorization',
      ]),
    )
  })

  it('传给 createLogger 后，日志中的 token 字段被脱敏', async () => {
    const received: unknown[] = []
    const listener = (entry: unknown) => received.push(entry)
    logBroadcaster.on('log', listener)

    const log = createLogger({ format: 'json', level: 'info', redact: LOG_REDACT_PATHS })
    log.info({ token: 'super-secret-value' }, 'redact test')

    await new Promise((r) => setTimeout(r, 50))
    logBroadcaster.off('log', listener)

    const entry = received.find((e) => (e as { msg?: string }).msg === 'redact test') as
      { token?: string } | undefined
    expect(entry?.token).not.toBe('super-secret-value')
  })

  it('手动记录含请求头的日志时，Authorization 字段会被脱敏（验证 redact 路径本身有效，即便当前 Fastify 默认日志不含 headers）', async () => {
    const received: unknown[] = []
    const listener = (entry: unknown) => received.push(entry)
    logBroadcaster.on('log', listener)

    const log = createLogger({ format: 'json', level: 'info', redact: LOG_REDACT_PATHS })
    log.info(
      { req: { headers: { authorization: 'Bearer super-secret-token' } } },
      'header redact test',
    )

    await new Promise((r) => setTimeout(r, 50))
    logBroadcaster.off('log', listener)

    const entry = received.find((e) => (e as { msg?: string }).msg === 'header redact test') as
      { req?: { headers?: { authorization?: string } } } | undefined
    expect(entry?.req?.headers?.authorization).not.toBe('Bearer super-secret-token')
  })
})
