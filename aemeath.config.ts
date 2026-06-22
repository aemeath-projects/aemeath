import type { EchoConfig } from '@aemeath-projects/exostrider/echo'

/** Aemeath 运行时配置（扩展 EchoConfig，追加 app 字段）。 */
export interface AemeathConfig extends EchoConfig {
  readonly app?: {
    readonly cacheKeyPrefix?: string
    readonly queueName?: string
    readonly heartbeatKeyPrefix?: string
    readonly commandPrefix?: string
    readonly defaultTimezone?: string
    readonly sessionTimeout?: number
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
