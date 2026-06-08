/**
 * Prisma 生成的 package.json 中 exports["."] 缺少 types 条件，
 * TypeScript 6 NodeNext 需要 import/require 子条件内也包含 types
 * 才能正确将声明文件视为 ESM 导出。
 */
const fs = require('node:fs')
const path = require('node:path')

const targets = ['prisma/main/generated/package.json', 'prisma/chat/generated/package.json']

for (const rel of targets) {
  const file = path.resolve(__dirname, '../..', rel)
  if (!fs.existsSync(file)) {
    console.warn(`[patch-prisma-exports] 跳过（不存在）: ${rel}`)
    continue
  }
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  let patched = false

  const root = pkg.exports?.['.']
  if (root) {
    if (!root.types) {
      root.types = './index.d.ts'
      patched = true
    }
    if (root.import && typeof root.import === 'object' && !root.import.types) {
      root.import = { types: './index.d.ts', ...root.import }
      patched = true
    }
    if (root.require && typeof root.require === 'object' && !root.require.types) {
      root.require = { types: './index.d.ts', ...root.require }
      patched = true
    }
  }

  if (patched) {
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`[patch-prisma-exports] 已修补: ${rel}`)
  } else {
    console.log(`[patch-prisma-exports] 无需修补: ${rel}`)
  }
}
