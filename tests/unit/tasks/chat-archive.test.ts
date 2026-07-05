import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IrisPrismaClient, AemeathPrismaClient } from '@/core/db/index.js'
import { IrisArchiveService } from '@/core/iris/archive.js'
import type { OssBundle } from '@/core/oss/index.js'
import { archiveIrisProcessor } from '@/tasks/chat-archive.js'

// vi.mock 提升到顶部，拦截 ESM 静态导入
vi.mock('@/core/iris/archive.js', () => ({
  IrisArchiveService: vi.fn(),
}))
vi.mock('@/core/iris/s3.js', () => ({
  IrisS3: vi.fn(),
}))
vi.mock('@/core/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ TMPDIR: '/tmp', S3_ENDPOINT_URL: 'http://minio:9000' }),
}))

describe('archiveIrisProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('S3_ENDPOINT_URL 为空时返回 skipped', async () => {
    // 重新 mock loadConfig，让 S3_ENDPOINT_URL 为空
    const { loadConfig } = await import('@/core/config.js')
    vi.mocked(loadConfig).mockReturnValue({ TMPDIR: '/tmp', S3_ENDPOINT_URL: '' } as ReturnType<
      typeof loadConfig
    >)

    const job = { data: {} } as Parameters<typeof archiveIrisProcessor>[0]
    const deps = {
      iris_db: {} as IrisPrismaClient,
      db: {} as AemeathPrismaClient,
      oss: {
        client: {},
        buckets: { iris: 'aemeath-iris', media: 'aemeath-media', render: 'aemeath-render' },
      } as unknown as OssBundle,
    }

    const result = await archiveIrisProcessor(job, deps)
    expect(result.type).toBe('self-contained')
    expect((result.summary as { status: string }).status).toBe('skipped')
  })

  it('S3 已配置时调用 IrisArchiveService.archive()', async () => {
    const { loadConfig } = await import('@/core/config.js')
    vi.mocked(loadConfig).mockReturnValue({
      TMPDIR: '/tmp',
      S3_ENDPOINT_URL: 'http://minio:9000',
    } as ReturnType<typeof loadConfig>)

    const mockArchive = vi.fn().mockResolvedValue({
      status: 'completed',
      results: [],
    })
    vi.mocked(IrisArchiveService).mockImplementation(function (this: unknown) {
      Object.assign(this as object, { archive: mockArchive })
    })

    const job = { data: {} } as Parameters<typeof archiveIrisProcessor>[0]
    const deps = {
      iris_db: {} as IrisPrismaClient,
      db: {} as AemeathPrismaClient,
      oss: {
        client: {},
        buckets: { iris: 'aemeath-iris', media: 'aemeath-media', render: 'aemeath-render' },
      } as unknown as OssBundle,
    }

    const result = await archiveIrisProcessor(job, deps)
    expect(result.type).toBe('self-contained')
    expect((result.summary as { status: string }).status).toBe('completed')
    expect(mockArchive).toHaveBeenCalledOnce()
  })
})
