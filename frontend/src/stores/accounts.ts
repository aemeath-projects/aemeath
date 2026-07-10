/** Accounts Store：账号列表管理与 SSE 实时状态更新。 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as accountsApi from '@/apis/accounts'
import type { AccountWithStatus, AccountStatusEvent } from '@/apis/accounts'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref<AccountWithStatus[]>([])
  const loading = ref(false)
  let closeStream: (() => void) | null = null

  async function load() {
    loading.value = true
    try {
      accounts.value = await accountsApi.listAccountsWithStatus()
    } finally {
      loading.value = false
    }
  }

  function applyStatusEvent(evt: AccountStatusEvent) {
    const idx = accounts.value.findIndex((a) => a.qq === evt.qq)
    if (idx === -1) return // 本地列表还没有这个账号（如刚创建，等 load() 补齐），忽略
    accounts.value[idx] = { ...accounts.value[idx], ...evt }
  }

  function connectStream() {
    if (closeStream) return
    closeStream = accountsApi.connectAccountStatusStream(applyStatusEvent, () => void load())
  }

  function disconnectStream() {
    closeStream?.()
    closeStream = null
  }

  return { accounts, loading, load, applyStatusEvent, connectStream, disconnectStream }
})
