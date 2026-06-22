/**
 * Dispatch 事件分发层类型定义 —— FeatureChecker 接口。
 */
import type { OneBotContext } from './context.js'

/** 功能权限检查器接口（由 SettingsPermissionChecker 实现）。 */
export interface FeatureChecker {
  check(ctx: OneBotContext): Promise<boolean>
}
