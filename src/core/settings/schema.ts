/**
 * Settings Schema Map 构建与启动同步。
 */

import type { SettingNodeMeta } from './decorators.js'
import { settingNodeRegistry } from './decorators.js'

import type { MainPrismaClient } from '@/core/db/client.js'
import { componentRegistry } from '@/core/framework/decorators.js'

// ── 类型定义 ──

export interface SettingNodeSchema {
  key: string
  type: 'boolean' | 'number' | 'string' | 'enum'
  default: unknown
  description: string
  enumOptions?: Record<string, number>
  scope: 'all' | 'group' | 'user'
  owner: string
}

// ── 内置系统配置项 ──

const BUILTIN_NODES: SettingNodeMeta[] = [
  {
    key: 'bot.enabled',
    type: 'boolean',
    default: true,
    description: 'Bot 总开关（群级）',
    scope: 'group',
  },
]

// ── Schema Map 构建 ──

/**
 * 从 settingNodeRegistry + componentRegistry 构建只读 Schema Map。
 * 同时注入内置系统配置项。
 */
export function buildSchemaMap(): ReadonlyMap<string, SettingNodeSchema> {
  const map = new Map<string, SettingNodeSchema>()

  // 内置节点（无 owner，标记为 __system__）
  for (const node of BUILTIN_NODES) {
    map.set(node.key, { ...node, owner: '__system__' })
  }

  // 遍历 settingNodeRegistry，关联 Component 名称
  for (const [target, nodes] of settingNodeRegistry) {
    const ownerName = findComponentName(target) ?? '__unknown__'
    for (const node of nodes) {
      map.set(node.key, { ...node, owner: ownerName })
    }
  }

  return map
}

/**
 * 根据装饰器目标类查找对应的 Component 名称。
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function findComponentName(target: Function): string | undefined {
  for (const [, meta] of componentRegistry) {
    if (meta.target === target) return meta.name
  }
  return undefined
}

// ── 启动同步 ──

interface SettingsRow {
  key: string
}

/**
 * 启动时同步 Schema Map 与 DB default 行。
 * - Schema 有 DB 无 → INSERT
 * - Schema 无 DB 有 → DELETE（所有 type）
 */
export async function syncDefaults(
  db: MainPrismaClient,
  schemaMap: ReadonlyMap<string, SettingNodeSchema>,
  logger?: { info: (msg: string) => void },
): Promise<void> {
  // 查询当前 DB 中的 default 行
  const existing: SettingsRow[] = await db.$queryRaw`
    SELECT key FROM settings WHERE type = 'default' AND scope = 0
  `
  const existingKeys = new Set(existing.map((r) => r.key))
  const schemaKeys = new Set(schemaMap.keys())

  // Schema 有、DB 无 → INSERT
  const toInsert = [...schemaKeys].filter((k) => !existingKeys.has(k))
  for (const key of toInsert) {
    const schema = schemaMap.get(key)
    if (!schema) continue
    const value = String(schema.default)
    const valueType = schema.type
    await db.$executeRaw`
      INSERT INTO settings (key, type, scope, value, value_type)
      VALUES (${key}, 'default', 0, ${value}, ${valueType}::settings_value_type)
      ON CONFLICT DO NOTHING
    `
    logger?.info(`[settings] 同步新增 default: ${key} = ${value}`)
  }

  // Schema 无、DB 有 → DELETE（所有 type 中同 key 的行）
  const toDelete = [...existingKeys].filter((k) => !schemaKeys.has(k))
  if (toDelete.length > 0) {
    await db.$executeRaw`
      DELETE FROM settings WHERE key = ANY(${toDelete}::text[])
    `
    logger?.info(`[settings] 清理废弃配置项: ${toDelete.join(', ')}`)
  }
}
