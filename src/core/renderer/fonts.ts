/**
 * 字体加载 —— 从 @fontsource/noto-sans-sc 包或构建产物中读取字体供 Satori 使用。
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Font } from 'satori'

const FONT_FILENAME = 'noto-sans-sc-chinese-simplified-400-normal.woff2'

function getFontPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url))

  // 生产构建：tsup onSuccess 将字体拷贝到 dist/assets/fonts/
  const distPath = resolve(thisDir, 'assets/fonts', FONT_FILENAME)
  if (existsSync(distPath)) return distPath

  // tsup splitting 产生 chunks 子目录时的路径
  const distChunksPath = resolve(thisDir, '../assets/fonts', FONT_FILENAME)
  if (existsSync(distChunksPath)) return distChunksPath

  // 开发模式：直接从 node_modules 里的 @fontsource 包读取
  const pkgPath = resolve(
    thisDir,
    '../../../node_modules/@fontsource/noto-sans-sc/files',
    FONT_FILENAME,
  )
  if (existsSync(pkgPath)) return pkgPath

  return distPath // 兜底，不存在时 loadFonts 会返回 fallback
}

export async function loadFonts(): Promise<Font[]> {
  const fontPath = getFontPath()

  if (!existsSync(fontPath)) {
    return [{ name: 'sans-serif', data: Buffer.alloc(0), weight: 400, style: 'normal' }]
  }

  const data = await readFile(fontPath)
  return [{ name: 'Noto Sans CJK SC', data, weight: 400, style: 'normal' }]
}
