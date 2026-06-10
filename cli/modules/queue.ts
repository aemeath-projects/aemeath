import { withProgress, withSpinner } from '../utils/progress.js'

export const label = '队列管理'

export const actions = {
  listJobs: (): Promise<void> =>
    withSpinner('获取队列状态', async () => {
      // TODO: 连接 BullMQ，列出各队列 waiting/active/failed 数量
      await new Promise<void>((r) => setTimeout(r, 400))
      console.log('\n  [TODO] 队列列表功能待实现')
    }),

  retryFailed: (): Promise<void> =>
    withProgress('重试失败任务', 5, async (tick) => {
      // TODO: 枚举 failed 任务并逐个调用 job.retry()
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((r) => setTimeout(r, 200))
        tick()
      }
      console.log('\n  [TODO] 重试失败任务功能待实现')
    }),
}
