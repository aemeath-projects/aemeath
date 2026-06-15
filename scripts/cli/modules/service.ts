import { withSpinner } from '../utils/progress.js'

export const label = '服务状态'

export const actions = {
  healthCheck: (): Promise<void> =>
    withSpinner('检查服务健康状态', async () => {
      await new Promise<void>((r) => setTimeout(r, 600))
    }),

  showConfig: (): Promise<void> =>
    withSpinner('读取当前配置', async () => {
      await new Promise<void>((r) => setTimeout(r, 200))
    }),
}
