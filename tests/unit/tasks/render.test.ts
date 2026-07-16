import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 仅测试 processor 逻辑，mock RenderService 和 OSS
vi.mock('@/renderer/index.js', () => ({
  RenderService: vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn(),
      render: vi.fn().mockResolvedValue(Buffer.from('fakepng')),
    }
  }),
  loadTemplates: vi.fn(),
  loadFonts: vi.fn().mockResolvedValue([]),
  TemplateNotFoundError: class TemplateNotFoundError extends Error {
    constructor(name: string) {
      super(`Template not found: ${name}`)
    }
  },
}))

vi.mock('@/core/oss/utils.js', () => ({
  uploadBuffer: vi.fn().mockResolvedValue(undefined),
  downloadBuffer: vi.fn().mockResolvedValue(Buffer.from('fakepng')),
  objectExists: vi.fn().mockResolvedValue(false),
  presignedGetObject: vi
    .fn()
    .mockResolvedValue('https://minio:9000/render-bucket/render/hash.png?sig=abc'),
}))

vi.mock('@/core/config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    RENDER_CACHE_TTL: 3600,
  }),
}))

describe('render processor', () => {
  const createMockCache = () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  })

  const createMockOss = () => ({
    client: {},
    buckets: { render: 'render-bucket', archive: 'archive-bucket', media: 'media-bucket' },
  })

  const createJob = (data: Record<string, unknown>): Job =>
    ({ id: 'test-job-1', name: 'render', data }) as unknown as Job

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('缓存未命中时渲染、写入结果缓存并返回 bot-action（presign 缓存写入的 S3 key）', async () => {
    const { taskDefinition } = await import('@/tasks/render.js')
    const { uploadBuffer, presignedGetObject } = await import('@/core/oss/utils.js')
    const cache = createMockCache()
    const oss = createMockOss()
    const job = createJob({
      template: 'help',
      data: { title: 'test' },
      sendTo: { groupId: '100' },
      width: 800,
      height: 1200,
    })

    const result = await taskDefinition.processor(job, { cache, oss })

    expect(result).toMatchObject({
      type: 'bot-action',
      calls: [
        {
          method: 'sendMsg',
          args: [{ messageType: 'group', groupId: '100' }],
        },
      ],
    })
    // 未命中：渲染后上传到可复用的 render/{hash}.png（不是 temp 对象）
    expect(uploadBuffer).toHaveBeenCalledTimes(1)
    expect((uploadBuffer as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).toMatch(
      /^render\/.+\.png$/,
    )
    // 写入 Redis 结果缓存 key（存 S3 key 字符串），不再写 temp key
    expect(cache.set).toHaveBeenCalledTimes(1)
    // presign 的是刚上传的那个 S3 key
    expect(presignedGetObject).toHaveBeenCalledWith(
      expect.anything(),
      'render-bucket',
      expect.stringMatching(/^render\/.+\.png$/),
      120,
    )
  })

  it('缓存命中且 S3 对象存在时直接 presign，不重新渲染', async () => {
    const { taskDefinition } = await import('@/tasks/render.js')
    const { RenderService } = await import('@/renderer/index.js')
    const { objectExists, presignedGetObject } = await import('@/core/oss/utils.js')
    ;(objectExists as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)

    const cache = createMockCache()
    cache.get.mockResolvedValueOnce('render/cachedhash.png')
    const oss = createMockOss()
    const job = createJob({
      template: 'help',
      data: { title: 'test' },
      sendTo: { groupId: '100' },
      width: 800,
      height: 1200,
    })

    const result = await taskDefinition.processor(job, { cache, oss })

    expect(result).toMatchObject({ type: 'bot-action' })
    // 不应该实例化渲染器执行渲染
    expect(RenderService).not.toHaveBeenCalled()
    expect(objectExists).toHaveBeenCalledWith(
      expect.anything(),
      'render-bucket',
      'render/cachedhash.png',
    )
    expect(presignedGetObject).toHaveBeenCalledWith(
      expect.anything(),
      'render-bucket',
      'render/cachedhash.png',
      120,
    )
  })

  it('缓存命中但 S3 对象不存在时降级重新渲染', async () => {
    const { taskDefinition } = await import('@/tasks/render.js')
    const { RenderService } = await import('@/renderer/index.js')
    const { objectExists } = await import('@/core/oss/utils.js')
    ;(objectExists as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false)

    const cache = createMockCache()
    cache.get.mockResolvedValueOnce('render/stalehash.png')
    const oss = createMockOss()
    const job = createJob({
      template: 'help',
      data: {},
      sendTo: { groupId: '100' },
    })

    const result = await taskDefinition.processor(job, { cache, oss })

    expect(result).toMatchObject({ type: 'bot-action' })
    expect(RenderService).toHaveBeenCalledTimes(1)
  })

  it('skipCache=true 时跳过缓存读写，上传一次性临时对象后 presign', async () => {
    const { taskDefinition } = await import('@/tasks/render.js')
    const { uploadBuffer, presignedGetObject } = await import('@/core/oss/utils.js')
    const cache = createMockCache()
    const oss = createMockOss()
    const job = createJob({
      template: 'help',
      data: {},
      sendTo: { groupId: '100' },
      skipCache: true,
    })

    const result = await taskDefinition.processor(job, { cache, oss })

    expect(result).toMatchObject({ type: 'bot-action' })
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
    expect(uploadBuffer).toHaveBeenCalledTimes(1)
    expect((uploadBuffer as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).toBe(
      'render/temp/test-job-1.png',
    )
    expect(presignedGetObject).toHaveBeenCalledWith(
      expect.anything(),
      'render-bucket',
      'render/temp/test-job-1.png',
      120,
    )
  })

  it('sendTo 为 userId 时构造 private 类型的 sendMsg 调用', async () => {
    const { taskDefinition } = await import('@/tasks/render.js')
    const cache = createMockCache()
    const oss = createMockOss()
    const job = createJob({
      template: 'help',
      data: {},
      sendTo: { userId: '9999' },
      skipCache: true,
    })

    const result = await taskDefinition.processor(job, { cache, oss })

    expect(result).toMatchObject({
      type: 'bot-action',
      calls: [{ method: 'sendMsg', args: [{ messageType: 'private', userId: '9999' }] }],
    })
  })
})
