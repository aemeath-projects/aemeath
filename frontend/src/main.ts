/** 前端应用入口：初始化 Vue、Pinia、Vuetify、路由并挂载根组件。 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import 'unfonts.css'
import { createVuetify } from 'vuetify'
import { zhHans } from 'vuetify/locale'

import App from './App.vue'
import router from './router'
import { useThemeStore } from './stores/theme'
import { getThemeById } from './themes'

const app = createApp(App)
const pinia = createPinia().use(piniaPluginPersistedstate)
app.use(pinia)

const themeStore = useThemeStore()
const themeDef = getThemeById(themeStore.theme)

app.use(router)
app.use(
  createVuetify({
    icons: {
      defaultSet: 'mdi',
    },
    theme: {
      defaultTheme: 'light',
      themes: {
        light: {
          colors: { ...themeDef.light },
        },
        dark: {
          colors: { ...themeDef.dark },
        },
      },
    },
    locale: {
      locale: 'zhHans',
      messages: { zhHans },
    },
  }),
)
app.mount('#app')
