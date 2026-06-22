/**
 * Dispatch 映射层独立类型 —— FeatureChecker 接口。
 * 从原 mapping.ts 提取，供 settings/permission.ts 和 feature-check-interceptor.ts 使用。
 */
import type { OneBotContext } from './context.js'

/** 功能权限检查器接口（由 SettingsPermissionChecker 实现）。 */
export interface FeatureChecker {
  check(ctx: OneBotContext): Promise<boolean>
}
