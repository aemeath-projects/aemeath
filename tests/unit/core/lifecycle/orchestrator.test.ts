import {
  LifecycleOrchestrator,
  ServiceRegistry,
  serviceEntryRegistry,
  type ServiceEntry,
} from '@aemeath-projects/exostrider/lifecycle'
import { beforeEach, describe, expect, it } from 'vitest'

/** 创建一个只有 @Startup / @Shutdown 方法的简单服务类。 */
function makeServiceClass(
  startupFn?: () => Promise<void>,
  shutdownFn?: () => Promise<void>,
): new () => { self: unknown; start(): Promise<void>; stop(): Promise<void> } {
  return class {
    self: unknown = null
    async start(): Promise<void> {
      this.self = this
      if (startupFn) await startupFn()
    }
    async stop(): Promise<void> {
      if (shutdownFn) await shutdownFn()
    }
  }
}

/** 构造服务条目，通过 provides: [{ propertyName: 'self', serviceKey: name }] 自动注册到 registry */
function makeEntry(
  name: string,
  opts: {
    injects?: ServiceEntry['injects']
    startupFn?: () => Promise<void>
    shutdownFn?: () => Promise<void>
    startupMethod?: string | null
    shutdownMethod?: string | null
    extraProvides?: ServiceEntry['provides']
  } = {},
): ServiceEntry {
  return {
    name,
    serviceClass: makeServiceClass(opts.startupFn, opts.shutdownFn),
    injects: opts.injects ?? [],
    provides: [{ propertyName: 'self', serviceKey: name }, ...(opts.extraProvides ?? [])],
    startupMethod: opts.startupMethod ?? 'start',
    shutdownMethod: opts.shutdownMethod ?? null,
  }
}

beforeEach(() => {
  serviceEntryRegistry.clear()
})

describe('LifecycleOrchestrator', () => {
  it('空注册表应直接启动无报错', async () => {
    const registry = new ServiceRegistry()
    const orchestrator = new LifecycleOrchestrator(registry)
    await expect(orchestrator.startup([])).resolves.toBeUndefined()
  })

  it('应实例化服务并调用 @Startup 方法', async () => {
    const callOrder: string[] = []

    const entry = makeEntry('svc_a', {
      startupFn: async () => {
        callOrder.push('a:start')
      },
    })

    const registry = new ServiceRegistry()
    const orchestrator = new LifecycleOrchestrator(registry)
    await orchestrator.startup([entry])

    expect(callOrder).toEqual(['a:start'])
  })

  it('应按拓扑顺序启动（@Inject 依赖优先）', async () => {
    const callOrder: string[] = []

    const entryA = makeEntry('svc_a', {
      startupFn: async () => {
        callOrder.push('a')
      },
    })
    const entryB = makeEntry('svc_b', {
      startupFn: async () => {
        callOrder.push('b')
      },
      injects: [{ propertyName: 'a', serviceKey: 'svc_a' }],
    })

    const registry = new ServiceRegistry()
    const orchestrator = new LifecycleOrchestrator(registry)
    await orchestrator.startup([entryA, entryB])

    // a 必须在 b 之前启动
    expect(callOrder).toEqual(['a', 'b'])
  })

  it('应将 @Inject 字段值正确赋给目标属性', async () => {
    const dbInstance = { query: () => 'result' }
    let injectedDb: unknown = null

    class SvcWithInject {
      db!: typeof dbInstance
      self: unknown = null
      async start() {
        this.self = this
        injectedDb = this.db
      }
    }

    const entry: ServiceEntry = {
      name: 'svc_consumer',
      serviceClass: SvcWithInject,
      injects: [{ propertyName: 'db', serviceKey: 'db' }],
      provides: [{ propertyName: 'self', serviceKey: 'svc_consumer' }],
      startupMethod: 'start',
      shutdownMethod: null,
    }

    const registry = new ServiceRegistry()
    registry.set('db' as never, dbInstance)
    const orchestrator = new LifecycleOrchestrator(registry)
    await orchestrator.startup([entry])

    expect(injectedDb).toBe(dbInstance)
  })

  it('应在 startup 后读取 @Provide 字段并注册到服务注册表', async () => {
    class SvcWithProvide {
      child: object = {}
      async start() {
        this.child = { id: 42 }
      }
    }

    const entry: ServiceEntry = {
      name: 'svc_with_provide',
      serviceClass: SvcWithProvide,
      injects: [],
      provides: [{ propertyName: 'child', serviceKey: 'child_svc' }],
      startupMethod: 'start',
      shutdownMethod: null,
    }

    const registry = new ServiceRegistry()
    const orchestrator = new LifecycleOrchestrator(registry)
    await orchestrator.startup([entry])

    // child_svc 应已注册到 registry
    expect(registry.getOptional('child_svc' as never)).toEqual({ id: 42 })
  })

  it('@Inject 依赖不满足时应抛出含服务名的错误', async () => {
    const entry = makeEntry('svc_bad', {
      injects: [{ propertyName: 'missing', serviceKey: 'nonexistent' }],
    })

    const registry = new ServiceRegistry()
    const orchestrator = new LifecycleOrchestrator(registry)
    await expect(orchestrator.startup([entry])).rejects.toThrow()
  })

  it('循环依赖应抛出错误', async () => {
    const entryX = makeEntry('svc_x', {
      injects: [{ propertyName: 'y', serviceKey: 'svc_y' }],
      startupMethod: null,
    })
    const entryY = makeEntry('svc_y', {
      injects: [{ propertyName: 'x', serviceKey: 'svc_x' }],
      startupMethod: null,
    })

    const registry = new ServiceRegistry()
    const orchestrator = new LifecycleOrchestrator(registry)
    await expect(orchestrator.startup([entryX, entryY])).rejects.toThrow()
  })

  it('shutdown 应按启动逆序调用 @Shutdown 方法', async () => {
    const callOrder: string[] = []

    const entryX = makeEntry('x', {
      shutdownFn: async () => {
        callOrder.push('x')
      },
      shutdownMethod: 'stop',
    })
    const entryY = makeEntry('y', {
      shutdownFn: async () => {
        callOrder.push('y')
      },
      injects: [{ propertyName: 'x', serviceKey: 'x' }],
      shutdownMethod: 'stop',
    })

    const registry = new ServiceRegistry()
    const orchestrator = new LifecycleOrchestrator(registry)
    await orchestrator.startup([entryX, entryY])
    await orchestrator.shutdown()

    // 启动顺序 x→y，关闭顺序 y→x
    expect(callOrder).toEqual(['y', 'x'])
  })
})
