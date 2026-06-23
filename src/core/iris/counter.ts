/**
 * IrisCounter —— 全局消息计数器，达到阈值时入队归档任务。
 */
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import type { Queue } from 'bullmq'

import type { IrisArchiveService } from './archive.js'

const log: PinoLogger = getLogger('IrisCounter') as unknown as PinoLogger

export class IrisCounter {
  private count = 0
  private archiving = false

  constructor(
    private readonly threshold: number,
    private readonly queue: Queue,
    private readonly irisArchive: IrisArchiveService,
  ) {}

  /** 获取归档阈值。 */
  getThreshold(): number {
    return this.threshold
  }

  increment(): void {
    this.count++
  }

  /**
   * 检查是否应触发归档，并原子性地加锁。
   * Node.js 单线程，check + set 无竞态。
   */
  shouldArchiveAndLock(): boolean {
    if (this.archiving || this.count < this.threshold) return false
    this.archiving = true
    return true
  }

  async triggerArchive(): Promise<void> {
    await this.queue.add('iris_archive', { trigger: 'threshold' })
    log.info(`IrisCounter: 达到阈值 ${String(this.threshold)}，已入队归档任务`)
  }

  /** 归档任务完成后调用，重置状态。 */
  async onArchiveComplete(): Promise<void> {
    await this.syncFromDb()
    this.archiving = false
    log.info(`IrisCounter: 归档完成，计数重置为 ${String(this.count)}`)
  }

  /** 启动时或归档完成后从数据库同步当前计数。 */
  async syncFromDb(): Promise<void> {
    this.count = await this.irisArchive.getCurrentPartitionRowCount()
  }
}
