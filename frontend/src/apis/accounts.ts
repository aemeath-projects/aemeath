/**
 * 账号管理 API 接口层 —— 封装 /api/accounts 所有后端接口调用。
 */

import { get, post, put, del } from './http'

/* 类型定义 */

export type AccountRole = 'master' | 'normal' | 'readonly'
export type AccountTransport = 'ws' | 'sse'
export type AccountState = 'connected' | 'disconnected' | 'connecting' | 'unknown'
export type PriorityMode = 'prefer_master' | 'prefer_normal'

export interface Account {
  qq: string
  nickname: string | null
  role: AccountRole
  transport: AccountTransport
  endpoint: string
  token: string | null
  isEnabled: boolean
}

/** 账号 + 实时连接状态组合视图，供批量状态端点使用。 */
export interface AccountWithStatus extends Account {
  state: AccountState
}

export interface AccountStatus {
  qq: string
  role: AccountRole
  state: AccountState
}

export interface CreateAccountDto {
  qq: string
  nickname?: string
  role: AccountRole
  transport: AccountTransport
  endpoint: string
  token?: string
  isEnabled?: boolean
}

export interface UpdateAccountDto {
  nickname?: string
  transport?: AccountTransport
  endpoint?: string
  token?: string
  isEnabled?: boolean
}

/* API 调用 */

export async function listAccounts(): Promise<Account[]> {
  return get<Account[]>('/api/accounts')
}

/** 批量获取账号信息 + 实时连接状态，一次请求替代"列表 + 逐个查状态"的 N+1 模式。 */
export async function listAccountsWithStatus(): Promise<AccountWithStatus[]> {
  return get<AccountWithStatus[]>('/api/accounts/status')
}

export async function createAccount(data: CreateAccountDto): Promise<Account> {
  return post<Account>('/api/accounts', data)
}

export async function updateAccount(qq: string, data: UpdateAccountDto): Promise<Account> {
  return put<Account>(`/api/accounts/${qq}`, data)
}

export async function deleteAccount(qq: string): Promise<void> {
  await del<null>(`/api/accounts/${qq}`)
}

export async function getAccountStatus(qq: string): Promise<AccountStatus> {
  return get<AccountStatus>(`/api/accounts/${qq}/status`)
}

export async function getPriorityMode(): Promise<{ mode: PriorityMode }> {
  return get<{ mode: PriorityMode }>('/api/accounts/priority-mode')
}

export async function setPriorityMode(mode: PriorityMode): Promise<void> {
  await post<null>('/api/accounts/priority-mode', { mode })
}
