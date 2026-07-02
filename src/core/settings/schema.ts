/**
 * Settings Schema Map 构建与启动清理。
 */
import type { SettingNodeOptions } from '@aemeath-projects/exostrider/dispatch'
import { handlerRegistry } from '@aemeath-projects/exostrider/dispatch'

import type { MainPrismaClient } from '@/core/db/index.js'

export interface SettingNodeSchema {
  key: string
  type: 'boolean' | 'number' | 'string' | 'enum'
  default: unknown
  description: string
  enumOptions?: Record<string, number>
  scope: 'all' | 'group' | 'user'
  owner: string
  ownerDisplayName: string
  category: 'permission' | 'config'
}

const BUILTIN_NODES: SettingNodeSchema[] = [
  {
    key: 'bot.enabled',
    type: 'boolean',
    default: true,
    description: 'Bot 总开关（群级）',
    scope: 'group',
    owner: '__system__',
    ownerDisplayName: '系统',
    category: 'permission',
  },
  {
    key: 'iris.archive_cycle_days',
    type: 'number',
    default: 0,
    description: '归档周期（天），0 表示禁用；master 账号所在群未设置时默认 180',
    scope: 'group',
    owner: '__system__',
    ownerDisplayName: '系统',
    category: 'config',
  },
]

function toSchema(
  key: string,
  options: SettingNodeOptions,
  owner: string,
  ownerDisplayName: string,
): SettingNodeSchema {
  // scope 映射：exostrider SettingNodeOptions.scope 为 'global' | 'group'，
  // 本地 SettingNodeSchema.scope 为 'all' | 'group' | 'user'
  const rawScope = options.scope
  const scope: 'all' | 'group' | 'user' = rawScope === 'group' ? 'group' : 'all'
  const category = (options.category ??
    (key.endsWith('.enabled') || key.endsWith('.permission') ? 'permission' : 'config')) as
    'permission' | 'config'

  return {
    key,
    type: options.type,
    default: options.default,
    description: options.description ?? '',
    enumOptions: options.enumOptions as Record<string, number> | undefined,
    scope,
    owner,
    ownerDisplayName,
    category,
  }
}

export function buildSchemaMap(): ReadonlyMap<string, SettingNodeSchema> {
  const map = new Map<string, SettingNodeSchema>()

  for (const node of BUILTIN_NODES) {
    map.set(node.key, node)
  }

  for (const entry of handlerRegistry.entries) {
    const ownerName = entry.options.name
    const ownerDisplayName = entry.options.displayName ?? ownerName
    for (const node of entry.settingNodes) {
      map.set(node.key, toSchema(node.key, node.options, ownerName, ownerDisplayName))
    }
  }

  return map
}

export async function cleanOrphanKeys(
  db: MainPrismaClient,
  schemaMap: ReadonlyMap<string, SettingNodeSchema>,
  logger?: { info: (msg: string) => void },
): Promise<void> {
  const rows: { key: string }[] = await db.$queryRaw`SELECT DISTINCT key FROM settings`
  const dbKeys = rows.map((r) => r.key)
  const schemaKeys = new Set(schemaMap.keys())
  const orphans = dbKeys.filter((k) => !schemaKeys.has(k))
  if (orphans.length > 0) {
    await db.$executeRaw`DELETE FROM settings WHERE key = ANY(${orphans}::text[])`
    logger?.info(`[settings] 清理废弃配置项: ${orphans.join(', ')}`)
  }
}
