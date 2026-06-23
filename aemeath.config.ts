import type { EchoConfig } from '@aemeath-projects/exostrider/echo'

/** Aemeath 运行时配置（扩展 EchoConfig，追加 app / iris / routing 字段）。 */
export interface AemeathConfig extends EchoConfig {
  readonly app?: {
    readonly cacheKeyPrefix?: string
    readonly queueName?: string
    readonly heartbeatKeyPrefix?: string
    readonly commandPrefix?: string
    readonly defaultTimezone?: string
    readonly sessionTimeout?: number
  }
  readonly iris?: {
    /** 全局消息数归档阈值（达到后入队归档任务） */
    readonly archiveThreshold?: number
    /** 元数据文本摘要长度（字符数） */
    readonly textSnippetLength?: number
  }
  readonly routing?: {
    /** 多账号路由默认优先级模式 */
    readonly defaultPriorityMode?: 'prefer_master' | 'prefer_normal'
    /** ClientPool 健康检查间隔（毫秒） */
    readonly healthCheckIntervalMs?: number
    /** 去重窗口时长（毫秒） */
    readonly dedupWindowMs?: number
  }
}

const config: AemeathConfig = {
  app: {
    /** Redis cache key 命名空间前缀 */
    cacheKeyPrefix: 'aemeath:',
    /** BullMQ 主任务队列名 */
    queueName: 'aemeath-tasks',
    /** Worker 心跳 Redis key 前缀 */
    heartbeatKeyPrefix: 'aemeath:worker:heartbeat',
    /** 命令触发前缀 */
    commandPrefix: '/',
    /** 定时任务默认时区 */
    defaultTimezone: 'Asia/Shanghai',
    /** 交互式会话默认超时（秒） */
    sessionTimeout: 300,
  },
  iris: {
    /** 全局消息计数达到此值时自动入队归档任务 */
    archiveThreshold: 100_000,
    /** 归档索引中保存的文本摘要最大长度 */
    textSnippetLength: 200,
  },
  routing: {
    /** 多账号路由策略：优先使用主账号 */
    defaultPriorityMode: 'prefer_master',
    /** ClientPool 健康检查间隔（毫秒） */
    healthCheckIntervalMs: 30_000,
    /** 事件去重窗口（毫秒） */
    dedupWindowMs: 5_000,
  },
  echoes: {
    handler: 'src/handlers',
    service: 'src/services',
    task: 'src/tasks',
    route: {
      dir: 'src/apis',
      exclude: ['**/schemas/**', '**/plugins/**'],
    },
  },
}

export default config
