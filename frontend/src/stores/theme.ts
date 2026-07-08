/** 主题偏好（亮色/暗色/跟随系统）与配色主题选择的状态管理的 Pinia Store。 */
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useTheme } from 'vuetify'
import { getThemeById } from '@/themes'

export type ThemePreference = 'light' | 'dark' | 'followOS'

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(preference: ThemePreference): string {
  if (preference === 'followOS') {
    return getSystemDark() ? 'dark' : 'light'
  }
  return preference
}

export const useThemeStore = defineStore(
  'theme',
  () => {
    const theme = ref('aemeath')
    const preference = ref<ThemePreference>('light')

    function applyThemeColors(vuetifyTheme: ReturnType<typeof useTheme>) {
      const def = getThemeById(theme.value)
      const { light, dark } = vuetifyTheme.themes.value
      if (light) {
        light.colors = def.light as typeof light.colors
      }
      if (dark) {
        dark.colors = def.dark as typeof dark.colors
      }
    }

    function applyTheme(vuetifyTheme: ReturnType<typeof useTheme>) {
      vuetifyTheme.change(resolveTheme(preference.value))
    }

    function setPreference(value: ThemePreference, vuetifyTheme: ReturnType<typeof useTheme>) {
      preference.value = value
      applyTheme(vuetifyTheme)
    }

    function setTheme(themeId: string, vuetifyTheme: ReturnType<typeof useTheme>) {
      theme.value = themeId
      applyThemeColors(vuetifyTheme)
      applyTheme(vuetifyTheme)
    }

    function initTheme(vuetifyTheme: ReturnType<typeof useTheme>) {
      applyThemeColors(vuetifyTheme)
      applyTheme(vuetifyTheme)

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', () => {
        if (preference.value === 'followOS') {
          applyTheme(vuetifyTheme)
        }
      })

      watch(preference, () => {
        applyTheme(vuetifyTheme)
      })
    }

    return { theme, preference, setPreference, setTheme, initTheme }
  },
  {
    persist: {
      key: 'aemeath-theme-preference',
      pick: ['theme', 'preference'],
    },
  },
)
