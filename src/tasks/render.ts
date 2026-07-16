/** render TaskDefinition —— 渲染模板生成图片，上传 S3 并通过 presigned URL 交由 Bot API 发送。 */

import { createHash } from 'node:crypto'

import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import { seg } from '@aemeath-projects/napcat'
import { UnrecoverableError } from 'bullmq'
import type { Client } from 'minio'

import { loadConfig } from '@/core/config.js'
import { objectExists, presignedGetObject, uploadBuffer } from '@/core/oss/index.js'
import type { OssBuckets } from '@/core/oss/index.js'
import type { RedisStore } from '@/core/redis/index.js'
import { cacheKeyRegistry } from '@/core/registries.js'
import type { BotApiCall, BotActionJobResult, TaskDefinition } from '@/core/tasks/index.js'
import { RenderService, TemplateNotFoundError, loadTemplates } from '@/renderer/index.js'

import '@/renderer/cache-keys.js'

const log: PinoLogger = getLogger('tasks:render') as unknown as PinoLogger

/** presigned URL 有效期（秒）——NapCat 收到消息后立即下载，时效充足。 */
const PRESIGNED_URL_TTL_SECONDS = 120

// 懒初始化：仅在 Worker 首次执行 render job 时加载字体，避免主进程 import 时触发
let _renderService: RenderService | null = null

async function getRenderer(): Promise<RenderService> {
  if (_renderService !== null) return _renderService
  const svc = new RenderService()
  await svc.initialize()
  await loadTemplates()
  _renderService = svc
  return _renderService
}

function computeHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32)
}

/** 将 presigned URL 包装成通用 bot-action 结果——渲染发图与其他消息发送共用同一条 Executor 路径。 */
function buildBotActionResult(
  presignedUrl: string,
  sendTo: { groupId: string } | { userId: string },
): BotActionJobResult {
  const imageSegment = seg.image(presignedUrl)
  const call: BotApiCall =
    'groupId' in sendTo
      ? {
          method: 'sendMsg',
          args: [{ messageType: 'group', groupId: sendTo.groupId, message: [imageSegment] }],
        }
      : {
          method: 'sendMsg',
          args: [{ messageType: 'private', userId: sendTo.userId, message: [imageSegment] }],
        }
  return { type: 'bot-action', calls: [call] }
}

interface RenderJobData {
  template: string
  data: unknown
  sendTo: { groupId: string } | { userId: string }
  width?: number
  height?: number
  skipCache?: boolean
  cacheTtl?: number
}

/**
 * 解析出本次响应最终使用的 S3 key。
 * 优先级：结果缓存命中（S3 对象仍存在）> 渲染后写入可复用结果缓存 > 渲染后上传一次性临时对象。
 */
async function resolveS3Key(
  jobId: string,
  ossClient: Client,
  renderBucket: string,
  cache: RedisStore,
  jobData: RenderJobData,
): Promise<string> {
  const { template, data, width, height, skipCache, cacheTtl } = jobData

  // 1. 缓存命中检查：Redis 存的是 S3 key 字符串，命中时直接 presign 该对象，不下载图片本体
  if (!skipCache) {
    const hash = computeHash({ template, data, width, height })
    const resultCacheKey = cacheKeyRegistry.buildKey('render', 'result', hash)
    const cachedS3Key = await cache.get<string>(resultCacheKey)
    if (cachedS3Key !== null) {
      const exists = await objectExists(ossClient, renderBucket, cachedS3Key)
      if (exists) {
        log.debug({ template, hash }, '渲染缓存命中')
        return cachedS3Key
      }
      // S3 对象不存在（被 lifecycle rule 删除）→ 降级重新渲染
      log.debug({ hash, s3Key: cachedS3Key }, '缓存 S3 对象不存在，重新渲染')
    }

    // 2. 缓存未命中或已失效，执行渲染
    const pngBuffer = await renderWithTemplateGuard(template, data, width, height)

    // 3. 优先写入可复用的结果缓存（render/{hash}.png + Redis key）；写入失败时降级为一次性临时对象。
    try {
      const cacheableKey = `render/${hash}.png`
      await uploadBuffer(ossClient, renderBucket, cacheableKey, pngBuffer)
      const ttl = cacheTtl ?? loadConfig().RENDER_CACHE_TTL
      await cache.set(resultCacheKey, cacheableKey, ttl)
      return cacheableKey
    } catch (err) {
      log.warn({ template, err }, '渲染结果缓存写入失败，改用一次性临时对象')
      const tempKey = `render/temp/${jobId}.png`
      await uploadBuffer(ossClient, renderBucket, tempKey, pngBuffer)
      return tempKey
    }
  }

  // skipCache=true：跳过缓存读写，渲染后直接上传一次性临时对象
  const pngBuffer = await renderWithTemplateGuard(template, data, width, height)
  const tempKey = `render/temp/${jobId}.png`
  await uploadBuffer(ossClient, renderBucket, tempKey, pngBuffer)
  return tempKey
}

async function renderWithTemplateGuard(
  template: string,
  data: unknown,
  width: number | undefined,
  height: number | undefined,
): Promise<Buffer> {
  try {
    const renderService = await getRenderer()
    return await renderService.render(template, data, { width, height })
  } catch (err) {
    if (err instanceof TemplateNotFoundError) {
      throw new UnrecoverableError(`模板 "${template}" 不存在，不可重试`)
    }
    throw err
  }
}

export const taskDefinition: TaskDefinition = {
  jobName: 'render',
  requires: ['cache', 'oss'],
  concurrency: 2,

  processor: async (job, deps) => {
    const { cache } = deps as { cache: RedisStore }
    const { client: ossClient, buckets } = deps.oss as { client: Client; buckets: OssBuckets }
    const renderBucket = buckets.render
    const jobData = job.data as RenderJobData
    const jobId = job.id ?? 'unknown'

    const s3Key = await resolveS3Key(jobId, ossClient, renderBucket, cache, jobData)

    // 生成 presigned URL，包装为通用 bot-action 结果（不含图片数据，避免 BullMQ Redis 内存积压）
    const presignedUrl = await presignedGetObject(
      ossClient,
      renderBucket,
      s3Key,
      PRESIGNED_URL_TTL_SECONDS,
    )
    return buildBotActionResult(presignedUrl, jobData.sendTo)
  },
}
