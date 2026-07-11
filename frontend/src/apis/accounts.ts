/**
 * 账号管理 API 接口层 —— 封装 /api/accounts 所有后端接口调用。
 */

import { get, post, put, del } from './http'

/* 类型定义 */

export type AccountRole = 'master' | 'normal' | 'readonly'
export type AccountTransport = 'ws' | 'sse'
export type AccountState = 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'unknown'
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

/* SSE 实时流 */

export type AccountStatusEvent = AccountWithStatus

/** 建立账号状态 SSE 连接；onReconnect 在浏览器自动重连成功后触发，用于重新拉取全量状态兜底可能错过的事件。 */
export function connectAccountStatusStream(
  onMessage: (evt: AccountStatusEvent) => void,
  onReconnect?: () => void,
): () => void {
  const eventSource = new EventSource('/api/accounts/stream')
  let hasErrored = false

  eventSource.onopen = () => {
    if (hasErrored) {
      hasErrored = false
      onReconnect?.()
    }
  }

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as Partial<AccountStatusEvent>
      // 防御性检查：后端握手事件走的是具名 `event: connected`，浏览器 EventSource 只会把
      // 未指定 event 字段的默认消息类型事件分发给 onmessage，握手事件本身不会走到这里；
      // 这里只是兜底过滤任何缺少 qq 的异常载荷，避免下游拿到不完整的状态对象。
      if (!data.qq) return
      onMessage(data as AccountStatusEvent)
    } catch {
      // 忽略解析失败的行
    }
  }

  eventSource.onerror = () => {
    hasErrored = true
  }

  return () => {
    eventSource.onopen = null
    eventSource.onmessage = null
    eventSource.onerror = null
    eventSource.close()
  }
}
