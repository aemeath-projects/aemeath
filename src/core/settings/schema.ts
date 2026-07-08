/**
 * Settings Schema Map 构建与启动清理。
 */
import { handlerRegistry } from '@aemeath-projects/exostrider/dispatch'

import { collectSettingNodes } from './decorators.js'
import type { SettingNodeOptions } from './decorators.js'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import { ValidationError } from '@/core/errors.js'

export interface SettingNodeSchema {
  key: string
  type: 'boolean' | 'number' | 'string' | 'enum'
  default: unknown
  description: string
  enumOptions?: Record<string, number>
  applicableScopeHint?: readonly string[]
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
    applicableScopeHint: ['group'],
    owner: '__system__',
    ownerDisplayName: '系统',
    category: 'permission',
  },
  {
    key: 'iris.archive_cycle_days',
    type: 'number',
    default: 0,
    description: '归档周期（天），0 表示禁用；master 账号所在群未设置时默认 180',
    applicableScopeHint: ['group'],
    owner: '__system__',
    ownerDisplayName: '系统',
    category: 'config',
  },
  {
    key: 'accounts.priority_mode',
    type: 'enum',
    default: 'prefer_master',
    description: '多账号消息路由优先级模式',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    enumOptions: { prefer_master: 0, prefer_normal: 1 },
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
  const category =
    options.category ??
    (key.endsWith('.enabled') || key.endsWith('.permission') ? 'permission' : 'config')

  return {
    key,
    type: options.type,
    default: options.default,
    description: options.description ?? '',
    enumOptions: options.enumOptions as Record<string, number> | undefined,
    applicableScopeHint: options.applicableScopeHint,
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
    for (const node of collectSettingNodes(entry)) {
      // 碰撞检测：同一 key 被不同 owner 声明视为配置错误（如 handler 名与内置系统 key 冲突）。
      // 同一 owner 重复声明同一 key（如子类通过继承覆盖父类默认值）是预期用法，允许覆盖。
      const existing = map.get(node.key)
      if (existing && existing.owner !== ownerName) {
        throw new ValidationError(
          `[settings] 配置项 key 冲突："${node.key}" 已被 "${existing.owner}" 注册，"${ownerName}" 不能重复声明同一 key`,
        )
      }
      map.set(node.key, toSchema(node.key, node.options, ownerName, ownerDisplayName))
    }
  }

  return map
}

export async function cleanOrphanKeys(
  db: AemeathPrismaClient,
  schemaMap: ReadonlyMap<string, SettingNodeSchema>,
  logger?: { info: (msg: string) => void },
): Promise<void> {
  const rows: { key: string }[] = await db.$queryRaw`SELECT DISTINCT key FROM settings`
  const dbKeys = rows.map((r) => r.key)
  const schemaKeys = new Set(schemaMap.keys())
  const orphans = dbKeys.filter((k) => !schemaKeys.has(k))
  if (orphans.length > 0) {
    const affectedRows =
      await db.$executeRaw`DELETE FROM settings WHERE key = ANY(${orphans}::text[])`
    logger?.info(`[settings] 清理废弃配置项 ${String(affectedRows)} 行: ${orphans.join(', ')}`)
  }
}
