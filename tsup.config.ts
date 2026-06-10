import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { defineConfig } from 'tsup'

const FONT_SRC = 'node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2'
const FONT_DEST_NAME = 'noto-sans-sc-chinese-simplified-400-normal.woff2'

export default defineConfig({
  entry: {
    main: 'src/core/main.ts',
    worker: 'src/core/worker.ts',
  },
  format: 'esm',
  target: 'node22',
  platform: 'node',
  splitting: true,
  clean: true,
  outDir: 'dist',
  sourcemap: true,
  minify: true,
  external: [/^#prisma\/.*/],
  esbuildOptions(options) {
    options.alias = { '@logger': resolve('./src/core/logging/index.ts') }
  },
  async onSuccess() {
    // 将 @fontsource/noto-sans-sc 中的字体拷贝到 dist/assets/fonts/
    const destDir = resolve('dist/assets/fonts')
    await mkdir(destDir, { recursive: true })
    await cp(resolve(FONT_SRC), resolve(destDir, FONT_DEST_NAME))
  },
})
