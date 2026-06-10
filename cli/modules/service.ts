import { withSpinner } from '../utils/progress.js'

export const label = '服务状态'

export const actions = {
  healthCheck: (): Promise<void> =>
    withSpinner('检查服务健康状态', async () => {
      // TODO: 依次检查 DB / Redis / BullMQ 连通性并汇总结果
      await new Promise<void>((r) => setTimeout(r, 600))
      console.log('\n  [TODO] 健康检查功能待实现')
    }),

  showConfig: (): Promise<void> =>
    withSpinner('读取当前配置', async () => {
      // TODO: 调用 loadConfig() 并脱敏后打印各环境变量
      await new Promise<void>((r) => setTimeout(r, 200))
      console.log('\n  [TODO] 配置查看功能待实现')
    }),
}
