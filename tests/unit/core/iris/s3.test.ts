import { describe, expect, it } from 'vitest'

import { IrisS3 } from '@/core/iris/s3.js'

describe('IrisS3.buildManifest', () => {
  it('应包含 groupId（字符串）和 seq', () => {
    const manifest = IrisS3.buildManifest(
      '123456789',
      1,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-07-01T00:00:00Z'),
      5000,
      2560000,
      512000,
      'a'.repeat(64),
    )

    expect(manifest.groupId).toBe('123456789')
    expect(manifest.seq).toBe(1)
    expect(manifest.version).toBe(1)
    expect(manifest.period.start).toBe('2024-01-01')
    expect(manifest.period.end).toBe('2024-07-01')
    expect(manifest.stats.totalRows).toBe(5000)
    expect(manifest.archive.compressionRatio).toBeGreaterThan(0)
    expect(manifest.archivedBy).toBe('aemeath-worker')
  })

  it('压缩比为 0 时 compressedBytes=0', () => {
    const manifest = IrisS3.buildManifest(
      '1',
      1,
      new Date('2024-01-01Z'),
      new Date('2024-02-01Z'),
      0,
      0,
      0,
      'b'.repeat(64),
    )
    expect(manifest.archive.compressionRatio).toBe(0)
  })
})
