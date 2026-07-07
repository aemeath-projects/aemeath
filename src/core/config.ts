/**
 * 环境配置模块 —— 使用 TypeBox 定义并校验所有环境变量。
 *
 * 独立于 Fastify，Worker 进程和主进程均可直接调用 {@link loadConfig}。
 */

import type { Static } from '@sinclair/typebox'
import { Type } from '@sinclair/typebox'
import { type ValueError, TypeCompiler } from '@sinclair/typebox/compiler'
import { Default } from '@sinclair/typebox/value'

import { AppError, ValidationError } from '@/core/errors.js'

/* Schema 定义 */

/** 所有环境变量的 TypeBox Schema。 */
export const ConfigSchema = Type.Object({
  // NapCat 资源
  IMAGE_URL_TTL: Type.Number({ minimum: 1, default: 7200 }),
  ENABLE_RKEY_REFRESH: Type.Boolean({ default: true }),

  // PostgreSQL
  DATABASE_URL: Type.String(),
  DB_POOL_SIZE: Type.Number({ minimum: 1, default: 10 }),
  IRIS_DATABASE_URL: Type.String(),
  IRIS_DB_POOL_SIZE: Type.Number({ minimum: 1, default: 5 }),

  // Redis
  BULLMQ_REDIS_URL: Type.String(),
  CACHE_REDIS_URL: Type.String(),
  PERSISTENT_REDIS_URL: Type.String({ default: '' }),
  CACHE_DEFAULT_TTL: Type.Number({ minimum: 1, default: 300 }),

  // 任务与 Worker
  TASK_SEND_DELAY_MS: Type.Number({
    default: 500,
    minimum: 0,
    description: 'Bot 任务发送延迟毫秒数',
  }),
  WORKER_CONCURRENCY: Type.Number({ default: 3, minimum: 1, description: 'BullMQ Worker 并发数' }),
  WORKER_HEARTBEAT_TTL_MS: Type.Number({
    default: 30_000,
    minimum: 1000,
    description: 'Worker 心跳 Redis key TTL 毫秒数',
  }),

  // 渲染缓存
  RENDER_CACHE_TTL: Type.Number({
    default: 3600,
    minimum: 1,
    description: '渲染结果 Redis 缓存 TTL（秒）',
  }),

  // S3
  S3_ENDPOINT_URL: Type.String({ default: '' }),
  S3_ACCESS_KEY_ID: Type.String({ default: '' }),
  S3_SECRET_ACCESS_KEY: Type.String({ default: '' }),
  S3_REGION: Type.String({ default: 'us-east-1' }),
  S3_IRIS_BUCKET: Type.String({ default: 'aemeath-iris' }),
  S3_MEDIA_BUCKET: Type.String({ default: 'aemeath-media' }),
  S3_RENDER_BUCKET: Type.String({ default: 'aemeath-render' }),

  // 监控与日志
  METRICS_ENABLED: Type.Boolean({ default: true }),
  LOG_LEVEL: Type.Union(
    [Type.Literal('debug'), Type.Literal('info'), Type.Literal('warn'), Type.Literal('error')],
    { default: 'info' },
  ),
  LOG_FORMAT: Type.Union([Type.Literal('json'), Type.Literal('console')], {
    default: 'json',
  }),

  // 认证与安全
  ADMIN_TOKEN: Type.String({ default: '', description: '管理后台 Bearer token，为空时跳过认证' }),
  CORS_ORIGINS: Type.String({
    default: 'http://localhost:5173',
    description: 'CORS 允许来源（逗号分隔）',
  }),

  // 服务器
  NODE_ENV: Type.Union([Type.Literal('development'), Type.Literal('production')], {
    default: 'development',
  }),
  HOST: Type.String({ default: '0.0.0.0' }),
  PORT: Type.Number({ minimum: 1, maximum: 65535, default: 8000 }),
  FRONTEND_DIST_DIR: Type.String({ default: 'frontend/dist' }),

  // 临时文件目录
  TMPDIR: Type.String({ default: '/tmp', description: '临时文件根目录' }),
})

/** 编译后的校验器（模块级单例，复用以提升性能）。 */
const compiledValidator = TypeCompiler.Compile(ConfigSchema)

/* 类型导出 */

/** Schema 推导的原始配置类型。 */
type RawConfig = Static<typeof ConfigSchema>

/** 含计算属性 isProduction 的完整配置类型。 */
export type Config = RawConfig & {
  /** 是否处于生产环境。 */
  readonly isProduction: boolean
}

/* Redis URL 规范化 */

/**
 * 规范化 Redis URL，强制使用 DB /0，忽略 URL 中填写的库索引。
 *
 * 允许运维人员在环境变量中省略 /0 后缀（如 redis://host:6379），
 * 系统内部统一补齐，确保所有连接指向 DB 0（Redis Cluster 兼容要求）。
 */
export function normalizeRedisUrl(url: string): string {
  const parsed = new URL(url)
  parsed.pathname = '/0'
  return parsed.toString()
}

/* 环境变量解析 */

/** 布尔型环境变量的 truthy 值集合。 */
const TRUTHY_VALUES: ReadonlySet<string> = new Set(['true', '1', 'yes'])

/**
 * 从 process.env 读取原始值，根据 Schema 类型做基本类型转换。
 *
 * TypeBox 校验器期望正确的 JS 类型（number / boolean），
 * 而 process.env 全部为 string，需要预处理。
 */
function parseEnv(env: Record<string, string | undefined>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const properties = ConfigSchema.properties

  for (const key of Object.keys(properties)) {
    const schema: unknown = properties[key as keyof typeof properties]
    const raw = env[key]

    // 未设置且 Schema 有默认值 → 跳过，让 TypeBox Default 填充
    if (raw === undefined || raw === '') {
      if (key === 'PERSISTENT_REDIS_URL') {
        // PERSISTENT_REDIS_URL 空字符串有特殊语义（回退到 CACHE_REDIS_URL）
        result[key] = ''
      }
      continue
    }

    // 根据 Schema 类型做转换
    if (isNumberSchema(schema)) {
      const num = Number(raw)
      result[key] = Number.isFinite(num) ? num : raw
    } else if (isBooleanSchema(schema)) {
      result[key] = TRUTHY_VALUES.has(raw.toLowerCase())
    } else {
      result[key] = raw
    }
  }

  return result
}

/** 判断 Schema 节点是否为 Number 类型。 */
function isNumberSchema(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'type' in schema &&
    (schema as Record<string, unknown>).type === 'number'
  )
}

/** 判断 Schema 节点是否为 Boolean 类型。 */
function isBooleanSchema(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'type' in schema &&
    (schema as Record<string, unknown>).type === 'boolean'
  )
}

/* 自定义校验（TypeBox Schema 无法覆盖的规则） */

/** 业务校验中使用的 key，提取为常量避免 dot-notation lint 问题。 */
const ENV_KEY = {
  DB_URL: 'DATABASE_URL',
  IRIS_DB_URL: 'IRIS_DATABASE_URL',
  BULLMQ_REDIS: 'BULLMQ_REDIS_URL',
  CACHE_REDIS: 'CACHE_REDIS_URL',
  PERSISTENT_REDIS: 'PERSISTENT_REDIS_URL',
} as const

/** 执行 TypeBox Schema 之外的业务规则校验。 */
function validateBusinessRules(config: Record<string, unknown>): void {
  // DATABASE_URL 必须以 postgresql:// 开头
  const dbUrl = config[ENV_KEY.DB_URL]
  if (typeof dbUrl === 'string' && !dbUrl.startsWith('postgresql://')) {
    throw new ValidationError(`DATABASE_URL 必须以 'postgresql://' 开头，当前值: "${dbUrl}"`)
  }

  // IRIS_DATABASE_URL 必须以 postgresql:// 开头
  const chatDbUrl = config[ENV_KEY.IRIS_DB_URL]
  if (typeof chatDbUrl === 'string' && !chatDbUrl.startsWith('postgresql://')) {
    throw new ValidationError(
      `IRIS_DATABASE_URL 必须以 'postgresql://' 开头，当前值: "${chatDbUrl}"`,
    )
  }

  // Redis URL 格式校验
  for (const key of [ENV_KEY.BULLMQ_REDIS, ENV_KEY.CACHE_REDIS] as const) {
    const url = config[key]
    if (typeof url === 'string') {
      assertRedisUrl(url, key)
    }
  }

  // PERSISTENT_REDIS_URL：非空时也要校验格式
  const persistentUrl = config[ENV_KEY.PERSISTENT_REDIS]
  if (typeof persistentUrl === 'string' && persistentUrl !== '') {
    assertRedisUrl(persistentUrl, ENV_KEY.PERSISTENT_REDIS)
  }
}

/** 断言 URL 以 redis:// 或 rediss:// 开头。 */
function assertRedisUrl(url: string, name: string): void {
  if (!url.startsWith('redis://') && !url.startsWith('rediss://')) {
    throw new ValidationError(`${name} 必须以 'redis://' 或 'rediss://' 开头，当前值: "${url}"`)
  }
}

/* 核心入口 */

/**
 * 从 process.env 加载并校验配置，返回不可变的 {@link Config} 对象。
 *
 * @param env - 可选，传入自定义环境变量（主要用于测试），默认读取 process.env
 * @throws 当必填变量缺失或格式不合法时抛出 Error
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = parseEnv(env)

  // 业务规则校验（在 TypeBox 校验之前，提供更友好的报错）
  validateBusinessRules(parsed)

  // 使用 TypeBox Default 填充默认值
  const withDefaults = Default(ConfigSchema, parsed) as RawConfig

  // TypeBox Schema 校验
  if (!compiledValidator.Check(withDefaults)) {
    const errors: ValueError[] = [...compiledValidator.Errors(withDefaults)]
    const messages = errors.map((e) => `  - ${e.path}: ${e.message}`)
    throw new AppError(-1, `配置校验失败:\n${messages.join('\n')}`, 400)
  }

  // Redis URL 规范化（在类型安全的对象上操作）
  const mutable: RawConfig = { ...withDefaults }
  mutable.BULLMQ_REDIS_URL = normalizeRedisUrl(mutable.BULLMQ_REDIS_URL)
  mutable.CACHE_REDIS_URL = normalizeRedisUrl(mutable.CACHE_REDIS_URL)

  // PERSISTENT_REDIS_URL 空 → 回退到 CACHE_REDIS_URL（已规范化）
  if (!mutable.PERSISTENT_REDIS_URL) {
    mutable.PERSISTENT_REDIS_URL = mutable.CACHE_REDIS_URL
  } else {
    mutable.PERSISTENT_REDIS_URL = normalizeRedisUrl(mutable.PERSISTENT_REDIS_URL)
  }

  // 添加 isProduction 计算属性并冻结
  Object.defineProperty(mutable, 'isProduction', {
    get(): boolean {
      return mutable.NODE_ENV === 'production'
    },
    enumerable: true,
    configurable: false,
  })

  return Object.freeze(mutable) as Config
}
