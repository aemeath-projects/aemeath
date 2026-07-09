/**
 * 站内信 Pinia Store —— 管理跨组件的未读消息计数与 SSE 实时推送。
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as mailboxApi from '@/apis/mailbox'
import type { MailboxItem } from '@/apis/mailbox'

export const useMailboxStore = defineStore('mailbox', () => {
  const unreadCount = ref(0)
  /** 最近一次通过 SSE 收到的站内信，供 App.vue 弹 toast、MailboxView 实时插入列表 */
  const latestMessage = ref<MailboxItem | null>(null)

  let closeStream: (() => void) | null = null

  async function fetchUnreadCount() {
    try {
      const { count } = await mailboxApi.fetchUnreadCount()
      unreadCount.value = count
    } catch {
      // 静默失败，不阻塞 UI
    }
  }

  function decrementUnread() {
    if (unreadCount.value > 0) unreadCount.value--
  }

  /** 建立全局 SSE 连接（App.vue onMounted 调用一次，会话期间保持）。 */
  function connectSSE() {
    if (closeStream) return
    closeStream = mailboxApi.connectMailboxStream((item) => {
      unreadCount.value++
      latestMessage.value = item
    })
  }

  /** 关闭 SSE 连接。 */
  function disconnectSSE() {
    closeStream?.()
    closeStream = null
  }

  return {
    unreadCount,
    latestMessage,
    fetchUnreadCount,
    decrementUnread,
    connectSSE,
    disconnectSSE,
  }
})
