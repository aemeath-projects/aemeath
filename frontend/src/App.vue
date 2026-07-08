<template>
  <v-app>
    <v-app-bar app color="primary" prominent>
      <v-app-bar-nav-icon @click="menuOpen = !menuOpen"></v-app-bar-nav-icon>
      <v-app-bar-title>Aemeath</v-app-bar-title>
      <v-spacer></v-spacer>
      <v-tooltip text="主题偏好" location="bottom">
        <template #activator="{ props }">
          <v-btn icon="mdi-weather-night" v-bind="props" @click="dialogDark = true"></v-btn>
        </template>
      </v-tooltip>
      <v-tooltip text="GitHub" location="bottom">
        <template #activator="{ props }">
          <v-btn
            icon="mdi-github"
            v-bind="props"
            href="https://github.com/aemeath-projects/aemeath"
            target="_blank"
          ></v-btn>
        </template>
      </v-tooltip>
    </v-app-bar>

    <Menu :open="menuOpen" @close="menuOpen = false" />

    <v-main>
      <v-dialog v-model="dialogDark" max-width="300">
        <v-card>
          <v-card-title>主题偏好</v-card-title>
          <v-card-text>
            <v-radio-group v-model="themePreference" column mandatory>
              <v-radio label="浅色模式" value="light"></v-radio>
              <v-radio label="深色模式" value="dark"></v-radio>
              <v-radio label="跟随系统设置" value="followOS"></v-radio>
            </v-radio-group>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="red" @click="dialogDark = false">
              <v-icon start>mdi-close</v-icon>关闭
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTheme } from 'vuetify'
import { useThemeStore } from './stores/theme'
import { useUserStore } from './stores/user'
import type { ThemePreference } from './stores/theme'
import Menu from './layouts/Menu.vue'

const vuetifyTheme = useTheme()
const themeStore = useThemeStore()
const userStore = useUserStore()

const dialogDark = ref(false)
const menuOpen = ref(false)

const themePreference = computed({
  get(): ThemePreference {
    return themeStore.preference
  },
  set(value: ThemePreference) {
    themeStore.setPreference(value, vuetifyTheme)
  },
})

onMounted(() => {
  themeStore.initTheme(vuetifyTheme)
  // 全局预加载会话数据，供全站 GroupAutocomplete/UserAutocomplete 本地搜索使用
  userStore.loadSessionData()
})
</script>

<style>
/* 全局光标工具类 */
.cursor-pointer {
  cursor: pointer;
}
</style>
