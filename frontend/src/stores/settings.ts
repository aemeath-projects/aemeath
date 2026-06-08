/** 前端本地设置状态管理（主题、队列刷新间隔、列表分页等）。 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    /** 队列监控数据刷新间隔（秒） */
    const queueRefreshInterval = ref<5 | 10 | 30>(10)

    /** 列表每页默认条数 */
    const defaultPageSize = ref<20 | 50 | 100>(20)

    return { queueRefreshInterval, defaultPageSize }
  },
  {
    persist: {
      key: 'aemeath-settings',
      pick: ['queueRefreshInterval', 'defaultPageSize'],
    },
  },
)
