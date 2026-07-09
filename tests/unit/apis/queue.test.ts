import { describe, it, expect } from 'vitest'

import { mapJobSchedulerToTask, mapActiveJob, mapPendingJob, mapWorker } from '@/apis/queue.js'

describe('mapJobSchedulerToTask()', () => {
  it('应当映射 name/pattern/tz 到定时任务展示结构', () => {
    const result = mapJobSchedulerToTask({
      name: 'archive_chat_history',
      pattern: '0 0 * * *',
      tz: 'Asia/Shanghai',
    })

    expect(result).toEqual({
      name: '聊天记录归档',
      task: 'archive_chat_history',
      schedule: '0 0 * * *',
      scheduleRaw: null,
      args: null,
      kwargs: null,
      options: { expires: null, queue: 'aemeath-tasks' },
      enabled: true,
    })
  })

  it('pattern 缺失时应当回退为空字符串', () => {
    const result = mapJobSchedulerToTask({ name: 'unknown_task' })
    expect(result.schedule).toBe('')
  })
})

describe('mapActiveJob()', () => {
  it('应当映射任务字段并把毫秒时间戳转为秒', () => {
    const result = mapActiveJob('aemeath-tasks', {
      id: 'job-1',
      name: 'trigger_daily_checkin',
      data: { foo: 'bar' },
      processedOn: 1700000000000,
    })

    expect(result).toEqual({
      worker: 'aemeath-tasks',
      id: 'job-1',
      name: '每日打卡',
      args: '{"foo":"bar"}',
      kwargs: '{}',
      started: 1700000000,
      acknowledged: true,
    })
  })

  it('id 与 processedOn 缺失时应当回退为空字符串/null', () => {
    const result = mapActiveJob('aemeath-tasks', {
      id: undefined,
      name: 'custom_job',
      data: {},
    })
    expect(result.id).toBe('')
    expect(result.started).toBeNull()
  })
})

describe('mapPendingJob()', () => {
  it('应当映射待处理任务字段，kwargs 恒为 null', () => {
    const result = mapPendingJob({ id: 'job-2', name: 'trigger_daily_like', data: [1, 2] })
    expect(result).toEqual({
      id: 'job-2',
      name: '每日点赞',
      args: '[1,2]',
      kwargs: null,
    })
  })
})

describe('mapWorker()', () => {
  it('应当从 addr 解析 pid', () => {
    const result = mapWorker('aemeath-tasks', {
      id: 'w1',
      addr: '127.0.0.1:6379:12345:worker-1',
      name: 'worker-1',
    })

    expect(result).toEqual({
      name: 'worker-1',
      concurrency: null,
      broker: 'aemeath-tasks',
      prefetchCount: null,
      pid: 12345,
      uptime: null,
    })
  })

  it('addr 缺失时 pid 应为 null', () => {
    const result = mapWorker('aemeath-tasks', { id: 'w2' })
    expect(result.pid).toBeNull()
    expect(result.name).toBe('w2')
  })
})
