/** Theme Store 单元测试：主题偏好切换、配色主题选择与持久化逻辑。 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore } from '@/stores/theme'

// mock vuetify useTheme，返回 themes.light/dark.colors + change 方法
vi.mock('vuetify', () => ({
  useTheme: vi.fn(() => {
    const lightColors = ref<Record<string, string>>({})
    const darkColors = ref<Record<string, string>>({})
    return {
      themes: ref({
        light: { colors: lightColors.value },
        dark: { colors: darkColors.value },
      }),
      change: vi.fn(),
    }
  }),
}))

import { useTheme } from 'vuetify'

// jsdom 未实现 matchMedia，提供最小 stub
const mockMediaQuery = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(() => mockMediaQuery),
})

function makeMockTheme() {
  return {
    themes: ref<Record<string, { colors: Record<string, string> }>>({
      light: { colors: {} },
      dark: { colors: {} },
    }),
    change: vi.fn(),
  } as unknown as ReturnType<typeof useTheme>
}

describe('useThemeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockMediaQuery.matches = false
  })

  /* 初始状态 */

  describe('初始状态', () => {
    it('preference 初始为 "light"', () => {
      const store = useThemeStore()
      expect(store.preference).toBe('light')
    })

    it('theme 初始为 "aemeath"', () => {
      const store = useThemeStore()
      expect(store.theme).toBe('aemeath')
    })
  })

  /* setPreference() */

  describe('setPreference()', () => {
    it('设置为 "dark" 后 preference 更新', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()

      store.setPreference('dark', mockTheme)

      expect(store.preference).toBe('dark')
    })

    it('设置为 "dark" 时调用 vuetifyTheme.change("dark")', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()

      store.setPreference('dark', mockTheme)

      expect(mockTheme.change).toHaveBeenCalledWith('dark')
    })

    it('设置为 "light" 时调用 vuetifyTheme.change("light")', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()

      store.setPreference('light', mockTheme)

      expect(mockTheme.change).toHaveBeenCalledWith('light')
    })

    it('设置为 "followOS" 时根据系统主题调用 change（jsdom 默认非暗色）', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()

      store.setPreference('followOS', mockTheme)

      expect(store.preference).toBe('followOS')
      expect(mockTheme.change).toHaveBeenCalledWith('light')
    })

    it('设置为 "followOS" 且系统为暗色时调用 change("dark")', () => {
      mockMediaQuery.matches = true
      const store = useThemeStore()
      const mockTheme = makeMockTheme()

      store.setPreference('followOS', mockTheme)

      expect(mockTheme.change).toHaveBeenCalledWith('dark')
    })
  })

  /* setTheme() */

  describe('setTheme()', () => {
    it('设置为 "aemeath" 后 theme 更新', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()
      store.theme = 'unknown'

      store.setTheme('aemeath', mockTheme)

      expect(store.theme).toBe('aemeath')
    })

    it('切换主题后写入 light/dark colors', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()

      store.setTheme('aemeath', mockTheme)

      expect(mockTheme.themes.value.light!.colors.primary).toBe('#22DFF2')
      expect(mockTheme.themes.value.dark!.colors.primary).toBe('#3FFEFB')
    })

    it('切换主题后重新应用亮度模式', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()
      store.preference = 'dark'

      store.setTheme('aemeath', mockTheme)

      expect(mockTheme.change).toHaveBeenCalledWith('dark')
    })
  })

  /* initTheme() */

  describe('initTheme()', () => {
    it('调用时立即应用当前 theme 的配色与偏好', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()
      store.preference = 'dark'

      store.initTheme(mockTheme)

      expect(mockTheme.themes.value.light!.colors.primary).toBe('#22DFF2')
      expect(mockTheme.change).toHaveBeenCalledWith('dark')
    })

    it('注册 matchMedia change 事件监听器', () => {
      const store = useThemeStore()
      const mockTheme = makeMockTheme()

      store.initTheme(mockTheme)

      expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })
  })
})
