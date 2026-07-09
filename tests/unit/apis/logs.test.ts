import { describe, it, expect } from 'vitest'

import { normalizePinoLevel } from '@/apis/logs.js'

describe('normalizePinoLevel()', () => {
  it('应当把 Pino 数字级别映射为小写字符串标签', () => {
    expect(normalizePinoLevel(10)).toBe('trace')
    expect(normalizePinoLevel(20)).toBe('debug')
    expect(normalizePinoLevel(30)).toBe('info')
    expect(normalizePinoLevel(40)).toBe('warn')
    expect(normalizePinoLevel(50)).toBe('error')
    expect(normalizePinoLevel(60)).toBe('fatal')
  })

  it('未知数字级别应当返回空字符串', () => {
    expect(normalizePinoLevel(99)).toBe('')
  })

  it('字符串级别应当原样小写化', () => {
    expect(normalizePinoLevel('DEBUG')).toBe('debug')
    expect(normalizePinoLevel('Warn')).toBe('warn')
  })

  it('非数字非字符串（null/undefined/对象）应当返回空字符串', () => {
    expect(normalizePinoLevel(null)).toBe('')
    expect(normalizePinoLevel(undefined)).toBe('')
    expect(normalizePinoLevel({})).toBe('')
  })
})
