/**
 * 本地 @SettingNode 装饰器 —— 完全独立于 exostrider 实现，读取 TC39 装饰器元数据。
 * 声明的是"可被后台 UI 编辑的配置项"，这是 aemeath 特有的业务概念，不经由 exostrider 转发。
 */
import type { HandlerRegistryData } from '@aemeath-projects/exostrider/dispatch'

const SETTING_NODES = Symbol('aemeath:setting-nodes')

export type SettingType = 'boolean' | 'number' | 'string' | 'enum'

export interface SettingNodeOptions {
  readonly type: SettingType
  readonly default: unknown
  readonly description?: string
  readonly enumOptions?: Record<string, unknown>
  readonly category?: 'permission' | 'config'
  /** 仅用于前端展示"通常用于 XX 层级"提示，不限制实际可写入的 scope（见设计文档 5.3）。 */
  readonly applicableScopeHint?: readonly string[]
}

export interface SettingNodeEntry {
  readonly key: string
  readonly options: SettingNodeOptions
}

export interface SettingNodeMeta {
  key: string
  type: SettingType
  default: unknown
  description: string
  enumOptions?: Record<string, number>
  applicableScopeHint?: readonly string[]
  category: 'permission' | 'config'
}

/**
 * 声明一个可被后台 UI 编辑的配置项，key 会在 collectSettingNodes() 中自动加上组件名前缀。
 *
 * TC39 装饰器元数据（`context.metadata`）在类继承时会通过原型链自动关联到父类的 metadata 对象
 * （子类 metadata 的 `[[Prototype]]` 即为父类 metadata）。若直接用 `metadata[SETTING_NODES] ??= []`
 * 读取，在子类场景下会通过原型链读到父类已存在的数组并原地 `push`，导致子类的声明污染父类的元数据
 * （反之亦然）。这里显式判断 SETTING_NODES 是否为 metadata 的自有属性：不是自有属性时，先克隆一份
 * 父类继承来的数组并挂载为子类自身的属性，再 push，从而与父类数组完全隔离。
 */
export function SettingNode(key: string, options: SettingNodeOptions) {
  return function (_target: unknown, context: ClassDecoratorContext) {
    const metadata = context.metadata
    if (!metadata) return

    const isOwn = Object.hasOwn(metadata, SETTING_NODES)
    let entries: SettingNodeEntry[]
    if (isOwn) {
      entries = metadata[SETTING_NODES] as SettingNodeEntry[]
    } else {
      const inherited = metadata[SETTING_NODES] as SettingNodeEntry[] | undefined
      entries = inherited ? [...inherited] : []
      metadata[SETTING_NODES] = entries
    }

    entries.push({ key, options })
  }
}

/** 从 handlerRegistry 条目的 TC39 元数据中读取 SettingNode 声明，并拼接组件名前缀。 */
export function collectSettingNodes(entry: HandlerRegistryData): SettingNodeEntry[] {
  const raw = (entry.metadata[SETTING_NODES] as SettingNodeEntry[] | undefined) ?? []
  return raw.map((node) => ({ ...node, key: `${entry.options.name}.${node.key}` }))
}
