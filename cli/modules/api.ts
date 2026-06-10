import { withProgress, withSpinner } from '../utils/progress.js'

export const label = 'API 测试'

export const actions = {
  listRoutes: (): Promise<void> =>
    withSpinner('获取路由列表', async () => {
      // TODO: 连接后端，解析 /docs/json 路由信息并格式化输出
      await new Promise<void>((r) => setTimeout(r, 500))
      console.log('\n  [TODO] 路由列表功能待实现')
    }),

  testEndpoint: (): Promise<void> =>
    withProgress('测试端点', 3, async (tick) => {
      // TODO: 交互式选择端点，依次发起 HTTP 请求并断言响应
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((r) => setTimeout(r, 300))
        tick()
      }
      console.log('\n  [TODO] 端点测试功能待实现')
    }),
}
