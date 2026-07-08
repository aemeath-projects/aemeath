/** 前端本地设置状态管理（队列刷新间隔等）。 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    /** 队列监控数据刷新间隔（秒） */
    const queueRefreshInterval = ref<5 | 10 | 30>(10)

    return { queueRefreshInterval }
  },
  {
    persist: {
      key: 'aemeath-settings',
      pick: ['queueRefreshInterval'],
    },
  },
)
