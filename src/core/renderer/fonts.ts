/**
 * 字体加载 —— 读取 assets/fonts/ 下的字体文件供 Satori 使用。
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Font } from 'satori'

function getFontDir(): string {
  // 兼容 tsup 打包后（dist/）和开发模式（src/core/renderer/）
  const thisDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(thisDir, 'assets/fonts'), // dist/ 打包后
    resolve(thisDir, '../assets/fonts'), // dist/chunks/ 子目录场景
    resolve(thisDir, '../../../assets/fonts'), // 开发模式 src/core/renderer/
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return candidates[0] ?? 'assets/fonts'
}

export async function loadFonts(): Promise<Font[]> {
  const fontDir = getFontDir()
  const fontPath = resolve(fontDir, 'NotoSansCJKsc-Regular.subset.woff2')

  if (!existsSync(fontPath)) {
    return [
      {
        name: 'sans-serif',
        data: Buffer.alloc(0),
        weight: 400,
        style: 'normal',
      },
    ]
  }

  const data = await readFile(fontPath)
  return [
    {
      name: 'Noto Sans CJK SC',
      data,
      weight: 400,
      style: 'normal',
    },
  ]
}
