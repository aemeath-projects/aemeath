import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LifecycleOrchestrator } from '../../../../src/core/lifecycle/orchestrator.js'
import type { ShutdownEntry, StartupEntry } from '../../../../src/core/lifecycle/registry.js'

function makeStartup(
  name: string,
  provides: string[],
  requires: string[],
  fn?: StartupEntry['fn'],
): StartupEntry {
  return {
    name,
    provides,
    requires,
    fn:
      fn ??
      (async (deps: Record<string, unknown>) => {
        const result: Record<string, unknown> = {}
        for (const key of provides) {
          result[key] = `${key}-service`
        }
        void deps
        return result
      }),
  }
}

function makeShutdown(name: string, fn?: ShutdownEntry['fn']): ShutdownEntry {
  return {
    name,
    fn:
      fn ??
      (async (_services: Record<string, unknown>) => {
        /* noop */
      }),
  }
}

describe('LifecycleOrchestrator', () => {
  let orchestrator: LifecycleOrchestrator

  beforeEach(() => {
    orchestrator = new LifecycleOrchestrator()
  })

  it('空 startupEntries 应直接返回基础设施服务', async () => {
    const infra = { db: 'database', cache: 'redis' }
    const result = await orchestrator.startup(infra, [])

    expect(result.db).toBe('database')
    expect(result.cache).toBe('redis')
  })

  it('应按依赖顺序启动模块', async () => {
    const order: string[] = []

    const dbEntry = makeStartup('db', ['db'], [], async (_deps) => {
      order.push('db')
      return { db: 'db-instance' }
    })
    const userEntry = makeStartup('user', ['user'], ['db'], async (_deps) => {
      order.push('user')
      return { user: 'user-service' }
    })
    const appEntry = makeStartup('app', ['app'], ['user', 'db'], async (_deps) => {
      order.push('app')
      return { app: 'app-service' }
    })

    // 故意乱序传入，拓扑排序应正确处理
    await orchestrator.startup({}, [appEntry, userEntry, dbEntry])

    expect(order[0]).toBe('db')
    expect(order[1]).toBe('user')
    expect(order[2]).toBe('app')
  })

  it('依赖由基础设施提供时应正确解析', async () => {
    const entry = makeStartup('user', ['user'], ['db'])
    const result = await orchestrator.startup({ db: 'db-instance' }, [entry])

    expect(result.user).toBeDefined()
    expect(result.db).toBe('db-instance')
  })

  it('应将 requires 的值传递给工厂函数', async () => {
    const receivedDeps: Record<string, unknown> = {}
    const entry: StartupEntry = {
      name: 'consumer',
      provides: ['consumer'],
      requires: ['db'],
      fn: async (deps) => {
        Object.assign(receivedDeps, deps)
        return { consumer: 'consumer-svc' }
      },
    }

    await orchestrator.startup({ db: 'real-db' }, [entry])
    expect(receivedDeps.db).toBe('real-db')
  })

  it('循环依赖应抛出错误', async () => {
    const a = makeStartup('a', ['a'], ['b'])
    const b = makeStartup('b', ['b'], ['a'])

    await expect(orchestrator.startup({}, [a, b])).rejects.toThrow()
  })

  it('缺失的 requires 应抛出错误', async () => {
    const entry = makeStartup('user', ['user'], ['nonexistent-dep'])

    await expect(orchestrator.startup({}, [entry])).rejects.toThrow()
  })

  it('shutdown 应按启动逆序执行', async () => {
    const order: string[] = []

    const entries = [
      makeStartup('a', ['a'], []),
      makeStartup('b', ['b'], ['a']),
      makeStartup('c', ['c'], ['b']),
    ]

    await orchestrator.startup({}, entries)

    const shutdowns = [
      makeShutdown('a', async () => {
        order.push('a')
      }),
      makeShutdown('b', async () => {
        order.push('b')
      }),
      makeShutdown('c', async () => {
        order.push('c')
      }),
    ]

    await orchestrator.shutdown(shutdowns)

    // 启动顺序：a -> b -> c，关闭顺序：c -> b -> a
    expect(order).toEqual(['c', 'b', 'a'])
  })

  it('没有对应 shutdown 的模块应被跳过', async () => {
    const entries = [makeStartup('a', ['a'], []), makeStartup('b', ['b'], ['a'])]

    await orchestrator.startup({}, entries)

    const shutdownFn = vi.fn().mockResolvedValue(undefined)
    // 仅注册 b 的 shutdown，a 没有 shutdown
    const shutdowns = [makeShutdown('b', shutdownFn)]

    await orchestrator.shutdown(shutdowns)
    expect(shutdownFn).toHaveBeenCalledOnce()
  })

  it('services getter 应返回当前所有服务', async () => {
    await orchestrator.startup({ infra: 'infra-value' }, [makeStartup('svc', ['svc'], ['infra'])])

    const svcs = orchestrator.services
    expect(svcs.infra).toBe('infra-value')
    expect(svcs.svc).toBe('svc-service')
  })
})
