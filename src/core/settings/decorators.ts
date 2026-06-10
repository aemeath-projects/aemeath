/**
 * Settings 装饰器 —— @SettingNode 声明配置项元数据。
 */

// ── 类型定义 ──

export type SettingValueType = 'boolean' | 'number' | 'string' | 'enum'

export interface SettingNodeOptions {
  type: SettingValueType
  default: unknown
  description?: string
  /** enum 专用：标签→数值映射，如 Permission */
  enumOptions?: Record<string, number>
  /** 适用的作用域，默认 'all' */
  scope?: 'all' | 'group' | 'user'
}

export interface SettingNodeMeta {
  key: string
  type: SettingValueType
  default: unknown
  description: string
  enumOptions?: Record<string, number>
  scope: 'all' | 'group' | 'user'
}

// ── 全局注册表 ──

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const settingNodeRegistry = new Map<Function, SettingNodeMeta[]>()

// ── 装饰器 ──

/**
 * 将配置项绑定到组件类。可叠加多个。
 * 使用方式：`@SettingNode('wife.enabled', { type: 'boolean', default: true })`
 */
export function SettingNode(key: string, options: SettingNodeOptions) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return function (target: Function): void {
    const meta: SettingNodeMeta = {
      key,
      type: options.type,
      default: options.default,
      description: options.description ?? '',
      enumOptions: options.enumOptions,
      scope: options.scope ?? 'all',
    }
    const existing = settingNodeRegistry.get(target) ?? []
    existing.push(meta)
    settingNodeRegistry.set(target, existing)
  }
}
