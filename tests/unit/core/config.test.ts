import { describe, expect, it, vi } from 'vitest'

import { loadConfig, normalizeRedisUrl } from '../../../src/core/config.js'

/**
 * 构造一份包含所有必填字段的最小有效环境变量集合。
 * 测试中可按需覆盖个别字段。
 */
function validEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NAPCAT_ACCESS_TOKEN: 'test-secret-token',
    DATABASE_URL: 'postgresql://texas:texas@localhost:5432/texas',
    CHAT_DATABASE_URL: 'postgresql://texas:texas@localhost:5432/chat_history',
    BULLMQ_REDIS_URL: 'redis://localhost:6379',
    CACHE_REDIS_URL: 'redis://localhost:6379',
    ...overrides,
  }
}

describe('loadConfig', () => {
  it('应当使用全部必填字段返回类型化的 Config 对象', () => {
    const config = loadConfig(validEnv())

    expect(config.NAPCAT_ACCESS_TOKEN).toBe('test-secret-token')
    expect(config.DATABASE_URL).toBe('postgresql://texas:texas@localhost:5432/texas')
    expect(config.CHAT_DATABASE_URL).toBe('postgresql://texas:texas@localhost:5432/chat_history')
    // 默认值
    expect(config.NAPCAT_MESSAGE_POST_FORMAT).toBe('array')
    expect(config.NAPCAT_REPORT_SELF_MESSAGE).toBe(false)
    expect(config.NAPCAT_HEART_INTERVAL).toBe(30000)
    expect(config.IMAGE_URL_TTL).toBe(7200)
    expect(config.DB_POOL_SIZE).toBe(10)
    expect(config.CHAT_DB_POOL_SIZE).toBe(5)
    expect(config.METRICS_ENABLED).toBe(true)
    expect(config.LOG_LEVEL).toBe('info')
    expect(config.LOG_FORMAT).toBe('json')
    expect(config.S3_REGION).toBe('us-east-1')
    expect(config.S3_ARCHIVE_BUCKET).toBe('texas-archive')
    expect(config.S3_ARCHIVE_PREFIX).toBe('chat-archive')
    expect(config.FRONTEND_DIST_DIR).toBe('frontend/dist')
  })

  it('缺少 NAPCAT_ACCESS_TOKEN 时应当抛出错误', () => {
    const env = validEnv({ NAPCAT_ACCESS_TOKEN: 'placeholder' })
    const envWithoutToken = Object.fromEntries(
      Object.entries(env).filter(([key]) => key !== 'NAPCAT_ACCESS_TOKEN'),
    )

    expect(() => loadConfig(envWithoutToken)).toThrow('NAPCAT_ACCESS_TOKEN')
  })

  it('NAPCAT_ACCESS_TOKEN 为空字符串时应当抛出错误', () => {
    expect(() => loadConfig(validEnv({ NAPCAT_ACCESS_TOKEN: '' }))).toThrow('NAPCAT_ACCESS_TOKEN')
  })

  it('NAPCAT_ACCESS_TOKEN 为纯空白时应当抛出错误', () => {
    expect(() => loadConfig(validEnv({ NAPCAT_ACCESS_TOKEN: '   ' }))).toThrow(
      'NAPCAT_ACCESS_TOKEN',
    )
  })

  it('DATABASE_URL 不以 postgresql:// 开头时应当抛出错误', () => {
    expect(() => loadConfig(validEnv({ DATABASE_URL: 'mysql://localhost/db' }))).toThrow(
      'postgresql://',
    )
  })

  it('CHAT_DATABASE_URL 不以 postgresql:// 开头时应当抛出错误', () => {
    expect(() => loadConfig(validEnv({ CHAT_DATABASE_URL: 'mysql://localhost/chat' }))).toThrow(
      'postgresql://',
    )
  })

  it('NODE_ENV 应当默认为 "development"', () => {
    const config = loadConfig(validEnv())
    expect(config.NODE_ENV).toBe('development')
  })

  it('PORT 应当默认为 8000', () => {
    const config = loadConfig(validEnv())
    expect(config.PORT).toBe(8000)
  })

  it('CACHE_DEFAULT_TTL 应当默认为 300', () => {
    const config = loadConfig(validEnv())
    expect(config.CACHE_DEFAULT_TTL).toBe(300)
  })

  it('应当正确解析自定义 PORT', () => {
    const config = loadConfig(validEnv({ PORT: '3000' }))
    expect(config.PORT).toBe(3000)
  })

  it('应当正确解析布尔值环境变量', () => {
    const config = loadConfig(
      validEnv({
        NAPCAT_REPORT_SELF_MESSAGE: 'true',
        METRICS_ENABLED: '0',
        ENABLE_RKEY_REFRESH: 'yes',
      }),
    )
    expect(config.NAPCAT_REPORT_SELF_MESSAGE).toBe(true)
    expect(config.METRICS_ENABLED).toBe(false)
    expect(config.ENABLE_RKEY_REFRESH).toBe(true)
  })

  it('isProduction 在 NODE_ENV=production 时应当为 true', () => {
    const config = loadConfig(validEnv({ NODE_ENV: 'production' }))
    expect(config.isProduction).toBe(true)
  })

  it('isProduction 在 NODE_ENV=development 时应当为 false', () => {
    const config = loadConfig(validEnv({ NODE_ENV: 'development' }))
    expect(config.isProduction).toBe(false)
  })

  it('isProduction 默认应当为 false', () => {
    const config = loadConfig(validEnv())
    expect(config.isProduction).toBe(false)
  })

  it('返回的配置对象应当被冻结', () => {
    const config = loadConfig(validEnv())
    expect(Object.isFrozen(config)).toBe(true)
  })
})

describe('Redis URL 规范化', () => {
  it('应当将无路径的 Redis URL 规范化为 /0', () => {
    const result = normalizeRedisUrl('redis://localhost:6379')
    expect(result).toBe('redis://localhost:6379/0')
  })

  it('应当将已有的 DB 索引替换为 /0', () => {
    const result = normalizeRedisUrl('redis://localhost:6379/5')
    expect(result).toBe('redis://localhost:6379/0')
  })

  it('应当保留 rediss:// 协议', () => {
    const result = normalizeRedisUrl('rediss://secure-host:6380/3')
    expect(result).toBe('rediss://secure-host:6380/0')
  })

  it('应当保留认证信息', () => {
    const result = normalizeRedisUrl('redis://user:pass@host:6379/2')
    expect(result).toBe('redis://user:pass@host:6379/0')
  })

  it('loadConfig 应当规范化所有 Redis URL', () => {
    const config = loadConfig(
      validEnv({
        BULLMQ_REDIS_URL: 'redis://localhost:6379/3',
        CACHE_REDIS_URL: 'redis://localhost:6379/5',
        PERSISTENT_REDIS_URL: 'redis://localhost:6379/7',
      }),
    )
    expect(config.BULLMQ_REDIS_URL).toBe('redis://localhost:6379/0')
    expect(config.CACHE_REDIS_URL).toBe('redis://localhost:6379/0')
    expect(config.PERSISTENT_REDIS_URL).toBe('redis://localhost:6379/0')
  })
})

describe('PERSISTENT_REDIS_URL 回退', () => {
  it('PERSISTENT_REDIS_URL 为空时应当回退到 CACHE_REDIS_URL', () => {
    const config = loadConfig(
      validEnv({
        CACHE_REDIS_URL: 'redis://cache-host:6379',
      }),
    )
    expect(config.PERSISTENT_REDIS_URL).toBe(config.CACHE_REDIS_URL)
  })

  it('PERSISTENT_REDIS_URL 为空时回退值应当已被规范化', () => {
    const config = loadConfig(
      validEnv({
        CACHE_REDIS_URL: 'redis://cache-host:6379/2',
      }),
    )
    // CACHE_REDIS_URL 被规范化为 /0，回退值也应如此
    expect(config.PERSISTENT_REDIS_URL).toBe('redis://cache-host:6379/0')
  })

  it('PERSISTENT_REDIS_URL 非空时不应回退', () => {
    const config = loadConfig(
      validEnv({
        CACHE_REDIS_URL: 'redis://cache-host:6379',
        PERSISTENT_REDIS_URL: 'redis://persistent-host:6379',
      }),
    )
    expect(config.PERSISTENT_REDIS_URL).toBe('redis://persistent-host:6379/0')
    expect(config.PERSISTENT_REDIS_URL).not.toBe(config.CACHE_REDIS_URL)
  })
})

describe('Redis URL 格式校验', () => {
  it('BULLMQ_REDIS_URL 格式错误时应当抛出错误', () => {
    expect(() => loadConfig(validEnv({ BULLMQ_REDIS_URL: 'http://not-redis' }))).toThrow(
      'BULLMQ_REDIS_URL',
    )
  })

  it('CACHE_REDIS_URL 格式错误时应当抛出错误', () => {
    expect(() => loadConfig(validEnv({ CACHE_REDIS_URL: 'http://not-redis' }))).toThrow(
      'CACHE_REDIS_URL',
    )
  })

  it('PERSISTENT_REDIS_URL 格式错误时应当抛出错误', () => {
    expect(() => loadConfig(validEnv({ PERSISTENT_REDIS_URL: 'http://not-redis' }))).toThrow(
      'PERSISTENT_REDIS_URL',
    )
  })
})

describe('process.env 集成', () => {
  it('应当能从 vi.stubEnv 设置的环境变量加载配置', () => {
    vi.stubEnv('NAPCAT_ACCESS_TOKEN', 'stub-token')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test')
    vi.stubEnv('CHAT_DATABASE_URL', 'postgresql://localhost/chat')
    vi.stubEnv('BULLMQ_REDIS_URL', 'redis://localhost:6379')
    vi.stubEnv('CACHE_REDIS_URL', 'redis://localhost:6379')
    vi.stubEnv('NODE_ENV', 'development')

    try {
      const config = loadConfig()
      expect(config.NAPCAT_ACCESS_TOKEN).toBe('stub-token')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
