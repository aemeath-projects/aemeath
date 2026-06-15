import { withProgress, withSpinner } from '../utils/progress.js'

export const label = 'API 测试'

export const actions = {
  listRoutes: (): Promise<void> =>
    withSpinner('获取路由列表', async () => {
      await new Promise<void>((r) => setTimeout(r, 500))
    }),

  testEndpoint: (): Promise<void> =>
    withProgress('测试端点', 3, async (tick) => {
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((r) => setTimeout(r, 300))
        tick()
      }
    }),
}
