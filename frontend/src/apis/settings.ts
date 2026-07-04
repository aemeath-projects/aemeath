/**
 * Settings REST API 封装。
 */

import { get, post } from './http'

/* 类型定义 */

export interface PathSegment {
  readonly type: string
  readonly id: string
}

export type Path = readonly PathSegment[]

export interface SettingNodeSchema {
  key: string
  type: 'boolean' | 'number' | 'string' | 'enum'
  default: unknown
  description: string
  enumOptions?: Record<string, number>
  applicableScopeHint?: string[]
  owner: string
  ownerDisplayName: string
  category: 'permission' | 'config'
}

export interface SettingValue {
  value: unknown
  overridden: boolean
  overriddenAtDepth: number | null
}

/* API 函数 */

const BASE = '/api/settings'

/** 获取所有配置项 Schema，可按前缀过滤。 */
export async function fetchSchemas(prefix?: string): Promise<SettingNodeSchema[]> {
  const params = prefix ? { prefix } : {}
  return get<SettingNodeSchema[]>(`${BASE}/schemas`, params)
}

/** 读取指定 path 下的配置值（含 Schema 默认值回退，含覆盖深度标记）。 */
export async function fetchSettingValues(
  path: Path,
  prefix?: string,
): Promise<Record<string, SettingValue>> {
  const params: Record<string, string> = { path: JSON.stringify(path) }
  if (prefix) params.prefix = prefix
  return get<Record<string, SettingValue>>(`${BASE}/values`, params)
}

/** 设置单项配置，value 为 null 时重置为默认值（回退到上一级）。 */
export async function setSettingValue(path: Path, key: string, value: unknown): Promise<void> {
  await post<null>(`${BASE}/values/${encodeURIComponent(key)}`, { value, path })
}

/** 批量设置指定 path 下的配置。 */
export async function batchSetSettingValues(
  path: Path,
  entries: { key: string; value: unknown }[],
): Promise<void> {
  await post<null>(`${BASE}/values/batch`, { entries, path })
}
