<script setup lang="ts">
import { useTheme } from 'vuetify'
import PageLayout from '@/layouts/PageLayout.vue'
import { useThemeStore } from '@/stores/theme'
import { themes } from '@/themes'

const vuetifyTheme = useTheme()
const themeStore = useThemeStore()

function onThemeChange() {
  themeStore.setPreference(themeStore.preference, vuetifyTheme)
}
</script>

<template>
  <PageLayout>
    <!-- 外观设置 -->
    <v-card class="mb-4">
      <v-card-title class="pa-4 pb-2 text-body-1 font-weight-bold">
        <v-icon start size="20">mdi-palette</v-icon>
        外观
      </v-card-title>
      <v-card-text class="pa-4 pt-0">
        <div class="text-body-2 text-medium-emphasis mb-3">配色主题</div>
        <div class="theme-grid">
          <div
            v-for="t in themes"
            :key="t.id"
            class="theme-card"
            :class="{ 'theme-card--active': themeStore.theme === t.id }"
            @click="themeStore.setTheme(t.id, vuetifyTheme)"
          >
            <div class="theme-card__swatches">
              <span
                v-for="c in [
                  t.light.primary,
                  t.light.secondary,
                  t.light.accent,
                  t.light.background,
                  t.light.surface,
                ]"
                :key="c"
                class="theme-card__swatch"
                :style="{ background: c }"
              />
            </div>
            <div class="theme-card__swatches theme-card__swatches--dark">
              <span
                v-for="c in [
                  t.dark.primary,
                  t.dark.secondary,
                  t.dark.accent,
                  t.dark.background,
                  t.dark.surface,
                ]"
                :key="c"
                class="theme-card__swatch"
                :style="{ background: c }"
              />
            </div>
            <div class="theme-card__body d-flex align-center justify-space-between">
              <div>
                <div class="theme-card__name">{{ t.name }}</div>
                <div class="theme-card__desc">{{ t.description }}</div>
              </div>
              <v-icon
                v-if="themeStore.theme === t.id"
                size="18"
                color="primary"
                class="flex-shrink-0"
              >
                mdi-check-circle
              </v-icon>
            </div>
          </div>
        </div>

        <v-divider class="my-4" />

        <div class="text-body-2 text-medium-emphasis mb-3">主题模式</div>
        <v-radio-group
          v-model="themeStore.preference"
          inline
          hide-details
          @update:model-value="onThemeChange"
        >
          <v-radio value="light" label="浅色" />
          <v-radio value="dark" label="深色" />
          <v-radio value="followOS" label="跟随系统" />
        </v-radio-group>
      </v-card-text>
    </v-card>
  </PageLayout>
</template>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.theme-card {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.theme-card:hover {
  background: rgba(var(--v-theme-primary), 0.04);
  border-color: rgba(var(--v-theme-primary), 0.25);
}

.theme-card--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.06);
}

.theme-card__swatches {
  display: flex;
  gap: 5px;
  margin-bottom: 4px;
}

.theme-card__swatches--dark {
  margin-bottom: 10px;
}

.theme-card__swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.theme-card__name {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.theme-card--active .theme-card__name {
  color: rgb(var(--v-theme-primary));
}

.theme-card__desc {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  margin-top: 2px;
}
</style>
