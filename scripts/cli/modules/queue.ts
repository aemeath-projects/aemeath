import { withProgress, withSpinner } from '../utils/progress.js'

export const label = '队列管理'

export const actions = {
  listJobs: (): Promise<void> =>
    withSpinner('获取队列状态', async () => {
      await new Promise<void>((r) => setTimeout(r, 400))
    }),

  retryFailed: (): Promise<void> =>
    withProgress('重试失败任务', 5, async (tick) => {
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((r) => setTimeout(r, 200))
        tick()
      }
    }),
}
