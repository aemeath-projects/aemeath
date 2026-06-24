/** Bot 在线状态的 Pinia Store —— 通过 /health 轮询连接状态。 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import http from '@/apis/http'

export interface HealthStatus {
  status: string
  wsConnected: boolean
}

export const useBotStore = defineStore('bot', () => {
  const online = ref(false)
  const loading = ref(false)

  async function fetchStatus() {
    loading.value = true
    try {
      const { data } = await http.get<HealthStatus>('/health')
      online.value = data.wsConnected
    } catch {
      online.value = false
    } finally {
      loading.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null

  function startPolling(intervalMs = 15000) {
    stopPolling()
    void fetchStatus()
    timer = setInterval(() => void fetchStatus(), intervalMs)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { online, loading, fetchStatus, startPolling, stopPolling }
})
