/**
 * Redis 缓存键注册表 —— 集中管理所有缓存键模板与构建函数。
 *
 * 各业务模块的缓存键定义集中在此文件，便于全局查阅和管理。
 * 每个导出函数接受类型安全的参数，返回格式化后的 Redis 键字符串。
 */

// ── 权限缓存 ──

/** 群功能权限缓存键。 */
export function permGroupKey(groupId: bigint | number, featureName: string): string {
  return `aemeath:perm:group:${String(groupId)}:${featureName}`
}

/** 私聊功能权限缓存键。 */
export function permPrivateKey(userId: bigint | number, featureName: string): string {
  return `aemeath:perm:private:${featureName}:${String(userId)}`
}

/** 群 bot 总开关缓存键。 */
export function permGroupEnabledKey(groupId: bigint | number): string {
  return `aemeath:perm:group_enabled:${String(groupId)}`
}

// ── 人员缓存 ──

/** 最近一次同步状态键。 */
export function personnelSyncStatusKey(): string {
  return 'aemeath:personnel:sync_status'
}

/** 同步任务分布式锁键。 */
export function personnelSyncLockKey(): string {
  return 'aemeath:lock:personnel_sync'
}

/** 用户关系等级缓存键。 */
export function userRelationKey(qq: bigint | number): string {
  return `aemeath:personnel:user:${String(qq)}:relation`
}

/** 超级管理员 QQ 号集合键。 */
export function adminSetKey(): string {
  return 'aemeath:personnel:admins'
}

// ── 签到缓存 ──

/** 某群某日的打卡状态键（dateStr 格式：YYYY-MM-DD）。 */
export function checkinDailyKey(groupId: bigint | number, dateStr: string): string {
  return `aemeath:checkin:${String(groupId)}:${dateStr}`
}

/** 用户在某群的签到统计缓存键。 */
export function checkinStatsKey(groupId: bigint | number, userId: bigint | number): string {
  return `aemeath:checkin:stats:${String(groupId)}:${String(userId)}`
}

// ── 会话缓存 ──

/** 会话元信息键。 */
export function sessionMetaKey(sessionKey: string): string {
  return `aemeath:session:${sessionKey}`
}

/** 会话数据键。 */
export function sessionDataKey(sessionKey: string): string {
  return `aemeath:session:${sessionKey}:data`
}

// ── Glob 模式（用于批量删除） ──

/** 群功能权限 glob 模式。 */
export const PERM_GROUP_GLOB = 'aemeath:perm:group:*:*'

/** 私聊功能权限 glob 模式。 */
export const PERM_PRIVATE_GLOB = 'aemeath:perm:private:*:*'

/** 群 bot 总开关 glob 模式。 */
export const PERM_GROUP_ENABLED_GLOB = 'aemeath:perm:group_enabled:*'

/** 人员关系缓存 glob 模式。 */
export const USER_RELATION_GLOB = 'aemeath:personnel:user:*:relation'

/** 签到打卡 glob 模式。 */
export const CHECKIN_DAILY_GLOB = 'aemeath:checkin:*:*'

/** 签到统计 glob 模式。 */
export const CHECKIN_STATS_GLOB = 'aemeath:checkin:stats:*:*'

/** 会话元信息 glob 模式。 */
export const SESSION_META_GLOB = 'aemeath:session:*'
