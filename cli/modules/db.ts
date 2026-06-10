import { withProgress, withSpinner } from '../utils/progress.js'

export const label = '数据库'

export const actions = {
  showMigrations: (): Promise<void> =>
    withSpinner('查询迁移状态', async () => {
      // TODO: 调用 prisma migrate status 并解析输出
      await new Promise<void>((r) => setTimeout(r, 500))
      console.log('\n  [TODO] 迁移状态功能待实现')
    }),

  runSeed: (): Promise<void> =>
    withProgress('执行 Seed', 3, async (tick) => {
      // TODO: 按顺序执行各 Seed 脚本
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((r) => setTimeout(r, 400))
        tick()
      }
      console.log('\n  [TODO] Seed 功能待实现')
    }),
}
