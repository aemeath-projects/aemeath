/**
 * 渲染服务单例与生命周期注册。
 */

import { RenderService } from './service.js'

import { Startup } from '@/core/lifecycle/registry.js'

/** 全局渲染服务单例（Startup 完成后可用）。 */
export const renderService = new RenderService()

/** render() 便捷函数，绑定到单例。 */
export const render: RenderService['render'] = renderService.render.bind(renderService)

Startup({
  name: 'renderer',
  provides: ['renderer'],
  requires: [],
})(async (_deps: Record<string, unknown>): Promise<Record<string, unknown>> => {
  await renderService.initialize()
  return { renderer: renderService }
})
