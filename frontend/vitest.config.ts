import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  test: {
    name: 'frontend',
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['tests/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'junit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/utils/**', 'src/composables/**', 'src/stores/**'],
      exclude: ['tests/**'],
      // thresholds: {
      //   lines: 70,
      //   functions: 70,
      //   branches: 70,
      //   statements: 70,
      // },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
