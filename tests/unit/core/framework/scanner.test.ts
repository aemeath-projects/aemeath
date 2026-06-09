import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  Component,
  OnCommand,
  componentRegistry,
  handlerRegistry,
} from '@/core/framework/decorators.js'
import { CompositeHandlerMapping } from '@/core/framework/mapping.js'
import { ComponentScanner } from '@/core/framework/scanner.js'

// ── 测试用辅助 ──

// 每次测试前清空全局注册表，避免跨测试污染
beforeEach(() => {
  componentRegistry.clear()
  handlerRegistry.clear()
})

afterEach(() => {
  componentRegistry.clear()
  handlerRegistry.clear()
})

describe('ComponentScanner', () => {
  it('registerHandlers() 应将 componentRegistry 中的组件注册到 mapping', () => {
    // 模拟装饰器副作用：手动填充 componentRegistry 和 handlerRegistry
    function handleEcho(): void {
      /* noop */
    }
    OnCommand('echo')(handleEcho)

    class EchoHandler {
      // 将 handleEcho 挂载到原型，与 @OnCommand 一致
      echo = handleEcho
    }

    Component({
      name: 'echo-component',
      displayName: '回声',
      description: '测试组件',
      defaultEnabled: true,
    })(EchoHandler)

    const mapping = new CompositeHandlerMapping()
    const scanner = new ComponentScanner()

    scanner.registerHandlers(mapping)

    expect(scanner.getComponentNames()).toContain('echo-component')
  })

  it('注册组件后 getComponentNames() 应返回组件名', () => {
    class TestHandler {
      run(): void {
        /* noop */
      }
    }

    Component({ name: 'test-comp' })(TestHandler)

    const mapping = new CompositeHandlerMapping()
    const scanner = new ComponentScanner()
    scanner.registerHandlers(mapping)

    expect(scanner.getComponentNames()).toContain('test-comp')
  })

  it('同一组件不应被重复注册', () => {
    class UniqueHandler {
      run(): void {
        /* noop */
      }
    }

    Component({ name: 'unique-comp' })(UniqueHandler)

    const mapping = new CompositeHandlerMapping()
    const scanner = new ComponentScanner()

    scanner.registerHandlers(mapping)
    scanner.registerHandlers(mapping) // 第二次调用

    const names = scanner.getComponentNames()
    expect(names.filter((n) => n === 'unique-comp')).toHaveLength(1)
  })

  it('componentRegistry 中有 handler 方法的组件应注册到 mapping', () => {
    // 创建一个有 handler 方法的组件
    function myHandle(): void {
      /* noop */
    }
    OnCommand('mycommand')(myHandle)

    class MyHandlerComp {
      // 必须将注册的函数放在 prototype 上才能被扫描器发现
      myHandle = myHandle
    }
    // 手动把方法放在原型上，模拟真实场景（装饰器修饰的方法在原型上）
    Object.defineProperty(MyHandlerComp.prototype, 'myHandle', {
      value: myHandle,
      writable: true,
      configurable: true,
    })

    Component({ name: 'my-handler-comp', defaultEnabled: true })(MyHandlerComp)

    const mapping = new CompositeHandlerMapping()
    const scanner = new ComponentScanner()
    scanner.registerHandlers(mapping)

    // handler 应被注册到 mapping
    expect(mapping.handlerCount).toBeGreaterThan(0)
  })

  it('空 componentRegistry 时 getComponentNames() 应返回空数组', () => {
    const mapping = new CompositeHandlerMapping()
    const scanner = new ComponentScanner()
    scanner.registerHandlers(mapping)

    expect(scanner.getComponentNames()).toHaveLength(0)
  })
})
