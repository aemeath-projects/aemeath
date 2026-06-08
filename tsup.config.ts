import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'core/main': 'src/core/main.ts',
    worker: 'src/worker.ts',
  },
  format: 'esm',
  target: 'node22',
  platform: 'node',
  splitting: true,
  clean: true,
  outDir: 'dist',
  sourcemap: true,
  external: [/^#prisma\/.*/],
})
