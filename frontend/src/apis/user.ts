/**
 * 用户管理 API 接口层 —— 封装 /api/user 所有后端接口调用。
 */

import { get, post, put, del } from './http'
import type { PaginatedResult } from './types'

export type { PaginatedResult } from './types'

export interface UserItem {
  qq: number
  nickname: string
  relation: string
  groupCount: number
  lastSynced: string | null
}

export interface UserDetail extends UserItem {
  memberships?: GroupMembershipInfo[]
}

export interface GroupItem {
  groupId: number
  groupName: string
  memberCount: number
  maxMemberCount: number
  isActive: boolean
  lastSynced: string | null
}

export interface GroupMemberItem {
  qq: number
  nickname: string
  card: string
  role: string
  relation: string
  joinTime: number
  lastActiveTime: number
  title: string
  level: string
}

export interface GroupMembershipInfo {
  groupId: number
  groupName: string
  card: string
  role: string
  isActive: boolean
}

export interface SyncStatus {
  lastSyncTime: string | null
  durationSeconds: number | null
  status: string
  usersSynced: number
  groupsSynced: number
  membershipsSynced: number
}

export interface AdminCandidate {
  qq: number
  nickname: string
  remark?: string
}

const BASE = '/api/user'

export async function fetchUsers(params: {
  page?: number
  pageSize?: number
  relation?: string | null
  qq?: number | null
  nickname?: string | null
}): Promise<PaginatedResult<UserItem>> {
  const query: Record<string, string | number> = {}
  if (params.page) query.page = params.page
  if (params.pageSize) query.pageSize = params.pageSize
  if (params.relation) query.relation = params.relation
  if (params.qq) query.qq = params.qq
  if (params.nickname) query.nickname = params.nickname
  return get<PaginatedResult<UserItem>>(`${BASE}/users`, query)
}

export async function fetchUser(qq: number): Promise<UserDetail> {
  return get<UserDetail>(`${BASE}/users/${qq}`)
}

export async function fetchUserGroups(qq: number): Promise<GroupItem[]> {
  return get<GroupItem[]>(`${BASE}/users/${qq}/groups`)
}

export async function fetchGroups(params: {
  page?: number
  pageSize?: number
  groupName?: string | null
  isActive?: boolean | null
}): Promise<PaginatedResult<GroupItem>> {
  const query: Record<string, string | number | boolean> = {}
  if (params.page) query.page = params.page
  if (params.pageSize) query.pageSize = params.pageSize
  if (params.groupName) query.groupName = params.groupName
  if (params.isActive !== null && params.isActive !== undefined) query.isActive = params.isActive
  return get<PaginatedResult<GroupItem>>(`${BASE}/groups`, query)
}

export async function fetchGroup(groupId: number): Promise<GroupItem> {
  return get<GroupItem>(`${BASE}/groups/${groupId}`)
}

export async function fetchGroupMembers(
  groupId: number,
  params: {
    page?: number
    pageSize?: number
    role?: string | null
    nickname?: string | null
    qq?: number | null
  },
): Promise<PaginatedResult<GroupMemberItem>> {
  const query: Record<string, string | number> = {}
  if (params.page) query.page = params.page
  if (params.pageSize) query.pageSize = params.pageSize
  if (params.role) query.role = params.role
  if (params.nickname) query.nickname = params.nickname
  if (params.qq) query.qq = params.qq
  return get<PaginatedResult<GroupMemberItem>>(`${BASE}/groups/${groupId}/members`, query)
}

export async function triggerSync(): Promise<void> {
  await post<null>(`${BASE}/sync`)
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  return get<SyncStatus>(`${BASE}/sync/status`)
}

export async function fetchAdmins(): Promise<UserItem[]> {
  return get<UserItem[]>(`${BASE}/admins`)
}

export async function setAdmin(userId: number): Promise<void> {
  await put<null>(`${BASE}/admins`, { userId: String(userId) })
}

export async function removeAdmin(): Promise<void> {
  await del<null>(`${BASE}/admins`)
}

export async function fetchAdminCandidates(): Promise<AdminCandidate[]> {
  return get<AdminCandidate[]>(`${BASE}/admin-candidates`)
}
