import { describe, expect, it, vi } from 'vitest'

import type { IrisPrismaClient, AemeathPrismaClient } from '@/core/db/index.js'
import { IrisArchiveService } from '@/core/iris/archive.js'
import type { IrisS3 } from '@/core/iris/s3.js'

function makeMockIrisDb() {
  return {
    archiveLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'uuid-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _max: { seq: null } }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  } as unknown as IrisPrismaClient
}

function makeMockMainDb(settingsRows: unknown[] = [], masterGroups: unknown[] = []) {
  return {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(settingsRows) // settings 查询
      .mockResolvedValueOnce(masterGroups), // master 群查询
  } as unknown as AemeathPrismaClient
}

function makeMockS3() {
  return {
    bucket: 'aemeath-iris',
    uploadFile: vi.fn().mockResolvedValue(undefined),
    uploadManifest: vi.fn().mockResolvedValue(undefined),
  } as unknown as IrisS3
}

describe('IrisArchiveService._discoverGroupCycles', () => {
  it('无 settings 记录且无 master 群时，返回 no_groups', async () => {
    const service = new IrisArchiveService(
      makeMockIrisDb(),
      makeMockMainDb([], []),
      { retentionMonths: 6, batchSize: 100, compression: 'zstd' },
      makeMockS3(),
      '/tmp',
    )

    const result = await service.archive()
    expect(result.status).toBe('no_groups')
  })

  it('master 群无显式设置时默认 180 天，无数据则 results 为空', async () => {
    const masterGroupRow = { groupId: '888' }
    // irisDb.$queryRaw 返回 null minCreatedAt（无数据）
    const irisDb = makeMockIrisDb()
    irisDb.$queryRaw = vi.fn().mockResolvedValue([{ minCreatedAt: null }])

    const service = new IrisArchiveService(
      irisDb,
      makeMockMainDb([], [masterGroupRow]),
      { retentionMonths: 6, batchSize: 100, compression: 'zstd' },
      makeMockS3(),
      '/tmp',
    )

    const result = await service.archive()
    expect(result.status).toBe('completed')
    expect(result.results).toHaveLength(0)
  })

  it('显式设置 value=0 时不归档（主动禁用）', async () => {
    const settingsRow = { scope: '888', value: '0' }
    const service = new IrisArchiveService(
      makeMockIrisDb(),
      makeMockMainDb([settingsRow], [{ groupId: '888' }]),
      { retentionMonths: 6, batchSize: 100, compression: 'zstd' },
      makeMockS3(),
      '/tmp',
    )

    const result = await service.archive()
    expect(result.status).toBe('no_groups')
  })
})

describe('IrisArchiveService.archive（单群）', () => {
  it('chat_history 无数据时跳过，status=empty', async () => {
    const irisDb = makeMockIrisDb()
    // MIN(created_at) 返回 null → 无数据
    irisDb.$queryRaw = vi.fn().mockResolvedValue([{ minCreatedAt: null }])

    const aemeathDb = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ scope: '123', value: '30' }]), // settings 查询（单群路径）
    } as unknown as AemeathPrismaClient

    const service = new IrisArchiveService(
      irisDb,
      aemeathDb,
      { retentionMonths: 6, batchSize: 100, compression: 'zstd' },
      makeMockS3(),
      '/tmp',
    )

    const result = await service.archive('123')
    expect(result.status).toBe('completed')
    const groupResult = result.results?.[0]
    expect(groupResult?.status).toBe('empty')
  })
})
