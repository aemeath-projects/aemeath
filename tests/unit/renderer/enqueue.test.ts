import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'

describe('enqueueRender', () => {
  it('向队列添加 render job 并返回 jobId', async () => {
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job-123' }) } as unknown as Queue
    const { enqueueRender } = await import('@/renderer/enqueue.js')

    const jobId = await enqueueRender(queue, {
      template: 'help',
      data: { title: 'test' },
      sendTo: { groupId: '100' },
    })

    expect(queue.add).toHaveBeenCalledWith(
      'render',
      expect.objectContaining({
        template: 'help',
        sendTo: { groupId: '100' },
      }),
    )
    expect(jobId).toBe('job-123')
  })

  it('BullMQ 未返回 job id 时抛出 AppError', async () => {
    const queue = { add: vi.fn().mockResolvedValue({ id: undefined }) } as unknown as Queue
    const { enqueueRender } = await import('@/renderer/enqueue.js')

    await expect(
      enqueueRender(queue, { template: 'help', data: {}, sendTo: { groupId: '1' } }),
    ).rejects.toThrow('BullMQ 未返回 job id')
  })
})
