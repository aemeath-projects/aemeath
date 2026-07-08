/**
 * Settings 模块入口 —— 统一导出 + Startup 生命周期注册。
 */

export { SettingNode, collectSettingNodes } from './decorators.js'
export type {
  SettingNodeMeta,
  SettingNodeOptions,
  SettingNodeEntry,
  SettingValueType,
} from './decorators.js'
export { Path, toScope, parseScope, buildAncestorScopes } from './path.js'
export type { PathSegment } from './path.js'
export { buildSchemaMap, cleanOrphanKeys } from './schema.js'
export type { SettingNodeSchema } from './schema.js'
export { SettingsService, ScopedSettingsService } from './service.js'
export type { SettingsGetAllEntry, SetOptions } from './service.js'
export { SettingsPermissionChecker } from './permission.js'
export type { MinimalSettingSchema, SettingsQueryContext } from './query.js'
export { getSettingValue } from './query.js'

import { Service, Inject, Provide, Startup } from '@aemeath-projects/exostrider/lifecycle'
import type { Redis } from 'ioredis'

import { SettingsPermissionChecker } from './permission.js'
import { buildSchemaMap, cleanOrphanKeys } from './schema.js'
import { SettingsService } from './service.js'

import type { AemeathPrismaClient } from '@/core/db/index.js'
import type { AdminService } from '@/core/user/index.js'

@Service({ name: 'settings_bootstrap' })
export class SettingsBootstrap {
  /** 注入主数据库 */
  @Inject('db')
  db!: AemeathPrismaClient

  /** 注入缓存 Redis 实例 */
  @Inject('cache_redis')
  redis!: Redis

  /** 注入御者管理服务 */
  @Inject('adminService')
  adminService!: AdminService

  /** 对外暴露 settings 服务实例 */
  @Provide('settings')
  settings!: SettingsService

  /** 对外暴露 settings_checker 服务实例 */
  @Provide('settings_checker')
  settingsChecker!: SettingsPermissionChecker

  @Startup
  async start(): Promise<void> {
    const schemaMap = buildSchemaMap()
    await cleanOrphanKeys(this.db, schemaMap)

    this.settings = new SettingsService(this.db, this.redis, schemaMap)
    this.settingsChecker = new SettingsPermissionChecker(
      this.settings,
      this.adminService,
      schemaMap,
    )
  }
}
