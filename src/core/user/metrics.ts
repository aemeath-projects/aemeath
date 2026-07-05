/**
 * 用户管理领域 Prometheus 指标 —— 通过 MetricRegistry 自注册。
 */

import { metricRegistry } from '@/core/registries.js'

export const userSyncTotal = metricRegistry.counter(
  'aemeath_user_sync_total',
  'User sync task executions',
  ['status'],
)

export const userSyncDuration = metricRegistry.histogram(
  'aemeath_user_sync_duration_seconds',
  'User sync task duration (from data collection to DB write)',
)

export const userTotal = metricRegistry.gauge(
  'aemeath_user_total',
  'Total known users in the users table',
)

export const userFriendsTotal = metricRegistry.gauge(
  'aemeath_user_friends_total',
  'Total friends (relation=friend)',
)

export const userGroupsTotal = metricRegistry.gauge(
  'aemeath_user_groups_total',
  'Total active groups (is_active=True)',
)

export const userAdminsTotal = metricRegistry.gauge(
  'aemeath_user_admins_total',
  'Total admins (relation=admin)',
)

export const userMembershipsTotal = metricRegistry.gauge(
  'aemeath_user_memberships_total',
  'Total active group memberships',
)

export const userSyncLastSuccessTs = metricRegistry.gauge(
  'aemeath_user_sync_last_success_timestamp',
  'Unix timestamp of the last successful user sync',
)

export const userApiErrors = metricRegistry.counter(
  'aemeath_user_api_errors_total',
  'User sync API call failures',
  ['action'],
)
