import { describe, expect, it } from 'vitest'

import { VERSION } from '@/core/version.js'

describe('version', () => {
  it('should export a semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
