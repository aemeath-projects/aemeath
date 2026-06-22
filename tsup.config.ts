import { defineConfig } from 'tsup'

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
})
