import { Command } from 'commander'

import { actions as api } from './modules/api.js'
import { actions as db } from './modules/db.js'
import { actions as queue } from './modules/queue.js'
import { actions as redis } from './modules/redis.js'
import { actions as service } from './modules/service.js'

export function buildProgram(): Command {
  const program = new Command().name('cli').description('aemeath 开发工具箱').version('1.0.0')

  program
    .command('api')
    .description('API 测试')
    .addCommand(new Command('list').description('列出所有路由').action(api.listRoutes))
    .addCommand(new Command('test').description('测试端点').action(api.testEndpoint))

  program
    .command('redis')
    .description('Redis / 缓存管理')
    .addCommand(new Command('stats').description('查看 Redis 统计').action(redis.showStats))
    .addCommand(new Command('flush').description('清除缓存').action(redis.flushCache))

  program
    .command('queue')
    .description('队列管理')
    .addCommand(new Command('list').description('查看队列状态').action(queue.listJobs))
    .addCommand(new Command('retry').description('重试失败任务').action(queue.retryFailed))

  program
    .command('db')
    .description('数据库操作')
    .addCommand(new Command('migrations').description('查看迁移状态').action(db.showMigrations))
    .addCommand(new Command('seed').description('执行 Seed').action(db.runSeed))

  program
    .command('service')
    .description('服务状态')
    .addCommand(new Command('health').description('健康检查').action(service.healthCheck))
    .addCommand(new Command('config').description('查看配置').action(service.showConfig))

  return program
}
