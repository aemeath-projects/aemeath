import { withProgress, withSpinner } from '../utils/progress.js'

export const label = '数据库'

export const actions = {
  showMigrations: (): Promise<void> =>
    withSpinner('查询迁移状态', async () => {
      await new Promise<void>((r) => setTimeout(r, 500))
    }),

  runSeed: (): Promise<void> =>
    withProgress('执行 Seed', 3, async (tick) => {
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((r) => setTimeout(r, 400))
        tick()
      }
    }),
}
