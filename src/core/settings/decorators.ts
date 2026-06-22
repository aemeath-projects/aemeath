/**
 * Settings 类型定义 —— SettingNode 装饰器由 @aemeath-projects/exostrider/dispatch 提供。
 */

export type SettingValueType = 'boolean' | 'number' | 'string' | 'enum'

export interface SettingNodeOptions {
  type: SettingValueType
  default: unknown
  description?: string
  enumOptions?: Record<string, number>
  scope?: 'all' | 'group' | 'user'
  category?: 'permission' | 'config'
}

export interface SettingNodeMeta {
  key: string
  type: SettingValueType
  default: unknown
  description: string
  enumOptions?: Record<string, number>
  scope: 'all' | 'group' | 'user'
  category: 'permission' | 'config'
}
