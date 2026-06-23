// tests/unit/core/tasks/models.test.ts
import { describe, expect, it } from 'vitest'

import { isBotActionResult, isSelfContainedResult } from '@/core/tasks/index.js'

describe('JobResult 类型守卫', () => {
  it('isBotActionResult 识别 bot-action 结果', () => {
    const r = { type: 'bot-action' as const, calls: [] }
    expect(isBotActionResult(r)).toBe(true)
    expect(isSelfContainedResult(r)).toBe(false)
  })

  it('isSelfContainedResult 识别 self-contained 结果', () => {
    const r = { type: 'self-contained' as const, summary: {} }
    expect(isSelfContainedResult(r)).toBe(true)
    expect(isBotActionResult(r)).toBe(false)
  })

  it('isBotActionResult 对无效输入返回 false', () => {
    expect(isBotActionResult(null)).toBe(false)
    expect(isBotActionResult({ type: 'unknown' })).toBe(false)
  })
})
