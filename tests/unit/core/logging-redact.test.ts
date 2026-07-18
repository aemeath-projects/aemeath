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
})
