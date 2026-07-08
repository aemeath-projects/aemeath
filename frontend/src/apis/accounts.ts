/**
 * 账号管理 API 接口层 —— 封装 /api/accounts 和 /api/routing 所有后端接口调用。
 */

import { get, post, put, del } from './http'

/* 类型定义 */

export type AccountRole = 'master' | 'normal' | 'readonly'
export type AccountTransport = 'ws' | 'sse'
export type AccountState = 'connected' | 'disconnected' | 'connecting' | 'unknown'

export interface Account {
  id: number
  qq: string
  nickname: string | null
  role: AccountRole
  transport: AccountTransport
  endpoint: string
  token: string | null
  isEnabled: boolean
}

export interface AccountStatus {
  id: number
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

export interface RoutingTableEntry {
  clientId: string
  state: AccountState
}

/* API 调用 */

export async function listAccounts(): Promise<Account[]> {
  return get<Account[]>('/api/accounts')
}

export async function createAccount(data: CreateAccountDto): Promise<Account> {
  return post<Account>('/api/accounts', data)
}

export async function updateAccount(id: number, data: UpdateAccountDto): Promise<Account> {
  return put<Account>(`/api/accounts/${id}`, data)
}

export async function deleteAccount(id: number): Promise<void> {
  await del<null>(`/api/accounts/${id}`)
}

export async function getAccountStatus(id: number): Promise<AccountStatus> {
  return get<AccountStatus>(`/api/accounts/${id}/status`)
}

export async function connectAccount(id: number): Promise<void> {
  await post<null>(`/api/accounts/${id}/connect`)
}

export async function disconnectAccount(id: number): Promise<void> {
  await post<null>(`/api/accounts/${id}/disconnect`)
}

export async function getRoutingTable(): Promise<RoutingTableEntry[]> {
  return get<RoutingTableEntry[]>('/api/routing/table')
}

export async function setRoutingPriorityMode(mode: string): Promise<void> {
  await post<null>('/api/routing/priority-mode', { mode })
}
