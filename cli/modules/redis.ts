import { withProgress, withSpinner } from '../utils/progress.js'

export const label = 'Redis / 缓存'

export const actions = {
  showStats: (): Promise<void> =>
    withSpinner('读取 Redis 统计', async () => {
      // TODO: 连接 CACHE_REDIS_URL，执行 INFO 命令并格式化输出
      await new Promise<void>((r) => setTimeout(r, 400))
      console.log('\n  [TODO] Redis 统计功能待实现')
    }),

  flushCache: (): Promise<void> =>
    withProgress('清除缓存', 4, async (tick) => {
      // TODO: 按命名空间枚举缓存 Key 并批量删除
      for (let i = 0; i < 4; i++) {
        await new Promise<void>((r) => setTimeout(r, 200))
        tick()
      }
      console.log('\n  [TODO] 缓存清除功能待实现')
    }),
}
