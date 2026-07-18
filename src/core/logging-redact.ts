/**
 * 日志敏感字段 redact 清单 —— 供 main.ts / worker.ts 的 createLogger() 调用共享。
 *
 * 账号凭据（token）存储在数据库 Account 表，不在环境变量中（见 config.ts），
 * 但一旦有代码不慎把账号对象整体传入日志字段，此清单能兜底脱敏。
 * `req.headers.authorization`/`req.headers.cookie` 两项是防御性预留——
 * Fastify 当前使用内置默认 req 序列化器（不含 headers 字段），这两条路径
 * 今天不会被触发；一旦未来有代码手动把请求头对象传入日志，这里能立即生效，
 * 不需要再补充 redact 配置。
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
