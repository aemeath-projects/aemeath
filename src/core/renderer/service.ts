/**
 * RenderService —— Satori + resvg-js 渲染管线。
 */

import { getLogger } from '@logger'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import type { Font } from 'satori'

import { RenderError, TemplateNotFoundError, TemplateRenderError } from '../errors.js'

import { loadFonts } from './fonts.js'
import type { RenderOptions, SatoriElement, TemplateFunction, TemplateRegistry } from './types.js'

const log = getLogger('renderer')

const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 1200

export class RenderService {
  private fonts: Font[] = []
  private readonly templates: TemplateRegistry = new Map()

  async initialize(): Promise<void> {
    this.fonts = await loadFonts()
    log.info({ fontCount: this.fonts.length }, 'renderer fonts loaded')
  }

  register(name: string, template: TemplateFunction): void {
    this.templates.set(name, template)
  }

  async render(name: string, data: unknown, options?: RenderOptions): Promise<Buffer> {
    if (this.fonts.length === 0) {
      throw new RenderError('Renderer not initialized')
    }

    const template = this.templates.get(name)
    if (!template) {
      throw new TemplateNotFoundError(name)
    }

    let element: SatoriElement
    try {
      element = template(data)
    } catch (err) {
      throw new TemplateRenderError(name, err)
    }

    const width = options?.width ?? DEFAULT_WIDTH
    const height = options?.height ?? DEFAULT_HEIGHT

    // 第一次渲染：大画布，获取实际内容高度
    const svgFull = await satori(element as never, { width, height, fonts: this.fonts })
    const resvgFull = new Resvg(Buffer.from(svgFull))
    const renderFull = resvgFull.render()
    const croppedHeight = cropBottom(renderFull.pixels, width, height)

    // 第二次渲染：按裁剪高度精确输出
    const svgFinal = await satori(element as never, {
      width,
      height: croppedHeight,
      fonts: this.fonts,
    })
    const resvgFinal = new Resvg(Buffer.from(svgFinal))
    return Buffer.from(resvgFinal.render().asPng())
  }
}

/**
 * 扫描 RGBA 像素，从底部向上找到最后一行非全白像素，返回裁剪高度。
 * pixels 为 resvg render().pixels（RGBA Uint8Array）。
 */
export function cropBottom(
  pixels: Uint8Array,
  width: number,
  height: number,
  padding = 16,
): number {
  for (let row = height - 1; row >= 0; row--) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4
      if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) {
        return Math.min(row + 1 + padding, height)
      }
    }
  }
  return 1
}
