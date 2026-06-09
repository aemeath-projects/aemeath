import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HeartbeatMonitor } from '@/core/ws/heartbeat.js'

describe('HeartbeatMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('recordHeartbeat + isAlive', () => {
    it('刚收到心跳时 isAlive 应为 true', () => {
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      expect(monitor.isAlive(5000)).toBe(true)
    })

    it('超过 timeoutMs 后 isAlive 应为 false', () => {
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      vi.advanceTimersByTime(6000)
      expect(monitor.isAlive(5000)).toBe(false)
    })

    it('未超过 timeoutMs 时 isAlive 应为 true', () => {
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      vi.advanceTimersByTime(3000)
      expect(monitor.isAlive(5000)).toBe(true)
    })

    it('多次 recordHeartbeat 应当刷新时间戳', () => {
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      vi.advanceTimersByTime(4000)
      // 再次记录心跳
      monitor.recordHeartbeat()
      vi.advanceTimersByTime(4000)
      // 从第二次记录算起仅过了 4s，未超时
      expect(monitor.isAlive(5000)).toBe(true)
    })
  })

  describe('start + stop', () => {
    it('在超时窗口内不应触发 onTimeout', () => {
      const onTimeout = vi.fn()
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      monitor.start(1000, 5000, onTimeout)

      vi.advanceTimersByTime(3000)
      expect(onTimeout).not.toHaveBeenCalled()

      monitor.stop()
    })

    it('超过 timeoutMs 后应触发 onTimeout', () => {
      const onTimeout = vi.fn()
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      monitor.start(1000, 2000, onTimeout)

      // 推进到超时后的检查点
      vi.advanceTimersByTime(3000)
      expect(onTimeout).toHaveBeenCalled()

      monitor.stop()
    })

    it('stop 后不应再触发 onTimeout', () => {
      const onTimeout = vi.fn()
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      monitor.start(1000, 2000, onTimeout)

      monitor.stop()
      vi.advanceTimersByTime(5000)
      expect(onTimeout).not.toHaveBeenCalled()
    })

    it('start 初始化时应重置心跳时间，防止立即超时', () => {
      const onTimeout = vi.fn()
      const monitor = new HeartbeatMonitor()
      // 模拟很久之前的心跳
      monitor.recordHeartbeat()
      vi.advanceTimersByTime(10000)

      // start 应重置内部计时器
      monitor.start(500, 2000, onTimeout)

      // 刚启动后不应立即超时
      vi.advanceTimersByTime(500)
      expect(onTimeout).not.toHaveBeenCalled()

      monitor.stop()
    })

    it('重复调用 start 不应创建多个 interval', () => {
      const onTimeout = vi.fn()
      const monitor = new HeartbeatMonitor()
      monitor.recordHeartbeat()
      monitor.start(1000, 2000, onTimeout)
      monitor.start(1000, 2000, onTimeout) // 重复调用

      vi.advanceTimersByTime(3000)
      // 只应有一个 interval 触发
      expect(onTimeout.mock.calls.length).toBeLessThanOrEqual(2)

      monitor.stop()
    })
  })
})
