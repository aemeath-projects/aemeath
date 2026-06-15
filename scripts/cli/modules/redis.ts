import { withProgress, withSpinner } from '../utils/progress.js'

export const label = 'Redis / 缓存'

export const actions = {
  showStats: (): Promise<void> =>
    withSpinner('读取 Redis 统计', async () => {
      await new Promise<void>((r) => setTimeout(r, 400))
    }),

  flushCache: (): Promise<void> =>
    withProgress('清除缓存', 4, async (tick) => {
      for (let i = 0; i < 4; i++) {
        await new Promise<void>((r) => setTimeout(r, 200))
        tick()
      }
    }),
}
