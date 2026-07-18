/**
 * 日志敏感字段 redact 清单 —— 供 main.ts / worker.ts 的 createLogger() 调用共享。
 *
 * 账号凭据（token）存储在数据库 Account 表，不在环境变量中（见 config.ts），
 * 但一旦有代码不慎把账号对象整体传入日志字段，此清单能兜底脱敏；
 * Fastify 默认记录请求日志（含 headers），需要防止 Authorization 请求头泄漏。
 */
export const LOG_REDACT_PATHS: string[] = [
  'token',
  '*.token',
  'password',
  '*.password',
  'secret',
  '*.secret',
  'req.headers.authorization',
  'req.headers.cookie',
]
