/**
 * SVG 渲染系统类型定义。
 */

export interface SatoriElement {
  type: string
  props: {
    style?: Record<string, unknown>
    children?: string | SatoriElement | (string | SatoriElement)[]
    [key: string]: unknown
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TemplateFunction<T = any> = (data: T) => SatoriElement

export interface RenderOptions {
  width?: number
  height?: number
}

export type TemplateRegistry = Map<string, TemplateFunction>
