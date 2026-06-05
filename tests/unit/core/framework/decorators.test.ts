import { beforeEach, describe, expect, it } from 'vitest'

import {
  Component,
  Feature,
  MessageScope,
  OnBotOffline,
  OnCommand,
  OnEndsWith,
  OnEssence,
  OnEvent,
  OnFullMatch,
  OnKeyword,
  OnMessageSent,
  OnNotice,
  OnPoke,
  OnRegex,
  OnRequest,
  OnStartsWith,
  Permission,
  componentRegistry,
  featureRegistry,
  handlerRegistry,
} from '../../../../src/core/framework/decorators.js'

// 测试前清空全局注册表，避免跨测试污染
beforeEach(() => {
  componentRegistry.clear()
  handlerRegistry.clear()
  featureRegistry.clear()
})

describe('Permission 常量', () => {
  it('应定义所有权限等级', () => {
    expect(Permission.ANYONE).toBe(0)
    expect(Permission.GROUP_MEMBER).toBe(10)
    expect(Permission.GROUP_ADMIN).toBe(20)
    expect(Permission.GROUP_OWNER).toBe(30)
    expect(Permission.ADMIN).toBe(100)
  })
})

describe('MessageScope 常量', () => {
  it('应定义所有作用域', () => {
    expect(MessageScope.ALL).toBe('all')
    expect(MessageScope.GROUP).toBe('group')
    expect(MessageScope.PRIVATE).toBe('private')
  })
})

// 非空 handler 类（避免 @typescript-eslint/no-extraneous-class）
class EchoHandler {
  handle(): void {
    /* noop */
  }
}

class MinimalHandler {
  handle(): void {
    /* noop */
  }
}

class SysHandler {
  handle(): void {
    /* noop */
  }
}

class SchedulerFeature {
  run(): void {
    /* noop */
  }
}

describe('@Component 装饰器', () => {
  it('应将组件注册到 componentRegistry', () => {
    Component({ name: 'echo', displayName: '回声', description: '复读消息', defaultEnabled: true })(
      EchoHandler,
    )

    expect(componentRegistry.has('echo')).toBe(true)
    const meta = componentRegistry.get('echo')
    expect(meta).toBeDefined()
    expect(meta?.name).toBe('echo')
    expect(meta?.displayName).toBe('回声')
    expect(meta?.description).toBe('复读消息')
    expect(meta?.defaultEnabled).toBe(true)
    expect(meta?.system).toBe(false)
    expect(meta?.target).toBe(EchoHandler)
  })

  it('应提供合理的默认值', () => {
    Component({ name: 'minimal' })(MinimalHandler)

    const meta = componentRegistry.get('minimal')
    expect(meta?.displayName).toBe('minimal')
    expect(meta?.description).toBe('')
    expect(meta?.tags).toEqual([])
    expect(meta?.admin).toBe(false)
    expect(meta?.defaultPriority).toBe(50)
    expect(meta?.defaultEnabled).toBe(false)
    expect(meta?.system).toBe(false)
  })

  it('system=true 应正确记录', () => {
    Component({ name: 'sys', system: true })(SysHandler)

    expect(componentRegistry.get('sys')?.system).toBe(true)
  })
})

describe('@OnCommand 装饰器', () => {
  it('应将处理器元数据注册到 handlerRegistry', () => {
    function handleEcho() {
      /* noop */
    }
    OnCommand('echo', { permission: Permission.ANYONE, scope: MessageScope.GROUP })(handleEcho)

    expect(handlerRegistry.has(handleEcho)).toBe(true)
    const metas = handlerRegistry.get(handleEcho)
    expect(metas).toHaveLength(1)
    const meta = metas?.[0]
    expect(meta?.mappingType).toBe('command')
    expect(meta?.cmd).toBe('echo')
    expect(meta?.permission).toBe(Permission.ANYONE)
    expect(meta?.messageScope).toBe(MessageScope.GROUP)
  })

  it('应支持叠加多个装饰器', () => {
    function multiHandler() {
      /* noop */
    }
    OnCommand('foo')(multiHandler)
    OnCommand('bar')(multiHandler)

    const metas = handlerRegistry.get(multiHandler)
    expect(metas).toHaveLength(2)
    expect(metas?.[0]?.cmd).toBe('foo')
    expect(metas?.[1]?.cmd).toBe('bar')
  })

  it('admin=true 应将 permission 设置为 ADMIN', () => {
    function adminHandler() {
      /* noop */
    }
    OnCommand('admin-cmd', { admin: true })(adminHandler)

    const meta = handlerRegistry.get(adminHandler)?.[0]
    expect(meta?.permission).toBe(Permission.ADMIN)
  })

  it('应支持 aliases', () => {
    function aliasHandler() {
      /* noop */
    }
    OnCommand('ping', { aliases: new Set(['p', 'pong']) })(aliasHandler)

    const meta = handlerRegistry.get(aliasHandler)?.[0]
    expect(meta?.aliases).toEqual(new Set(['p', 'pong']))
  })
})

describe('@OnRegex 装饰器', () => {
  it('应注册 regex 类型元数据并编译正则', () => {
    function regexHandler() {
      /* noop */
    }
    OnRegex('hello\\s+world')(regexHandler)

    const meta = handlerRegistry.get(regexHandler)?.[0]
    expect(meta?.mappingType).toBe('regex')
    expect(meta?.pattern).toBe('hello\\s+world')
    expect(meta?.compiledPattern).toBeInstanceOf(RegExp)
    expect(meta?.compiledPattern?.test('hello world')).toBe(true)
  })
})

describe('@OnKeyword 装饰器', () => {
  it('应注册 keyword 类型元数据', () => {
    function kwHandler() {
      /* noop */
    }
    OnKeyword(new Set(['cat', 'dog']))(kwHandler)

    const meta = handlerRegistry.get(kwHandler)?.[0]
    expect(meta?.mappingType).toBe('keyword')
    expect(meta?.keywords).toEqual(new Set(['cat', 'dog']))
  })
})

describe('@OnStartsWith 装饰器', () => {
  it('应注册 startswith 类型元数据', () => {
    function swHandler() {
      /* noop */
    }
    OnStartsWith('!cmd')(swHandler)

    const meta = handlerRegistry.get(swHandler)?.[0]
    expect(meta?.mappingType).toBe('startswith')
    expect(meta?.prefix).toBe('!cmd')
  })
})

describe('@OnEndsWith 装饰器', () => {
  it('应注册 endswith 类型元数据', () => {
    function ewHandler() {
      /* noop */
    }
    OnEndsWith('吗？')(ewHandler)

    const meta = handlerRegistry.get(ewHandler)?.[0]
    expect(meta?.mappingType).toBe('endswith')
    expect(meta?.suffix).toBe('吗？')
  })
})

describe('@OnFullMatch 装饰器', () => {
  it('应注册 fullmatch 类型元数据', () => {
    function fmHandler() {
      /* noop */
    }
    OnFullMatch('菜单')(fmHandler)

    const meta = handlerRegistry.get(fmHandler)?.[0]
    expect(meta?.mappingType).toBe('fullmatch')
    expect(meta?.text).toBe('菜单')
  })
})

describe('@OnEvent 装饰器', () => {
  it('应注册 event_type 类型元数据', () => {
    function evHandler() {
      /* noop */
    }
    OnEvent('notice')(evHandler)

    const meta = handlerRegistry.get(evHandler)?.[0]
    expect(meta?.mappingType).toBe('event_type')
    expect(meta?.eventType).toBe('notice')
  })
})

describe('@OnNotice 装饰器', () => {
  it('应注册 notice 类型事件元数据', () => {
    function noticeHandler() {
      /* noop */
    }
    OnNotice('group_ban', 'ban')(noticeHandler)

    const meta = handlerRegistry.get(noticeHandler)?.[0]
    expect(meta?.eventType).toBe('notice')
    expect(meta?.noticeType).toBe('group_ban')
    expect(meta?.subType).toBe('ban')
  })
})

describe('@OnRequest 装饰器', () => {
  it('应注册 request 类型事件元数据', () => {
    function reqHandler() {
      /* noop */
    }
    OnRequest('friend')(reqHandler)

    const meta = handlerRegistry.get(reqHandler)?.[0]
    expect(meta?.eventType).toBe('request')
    expect(meta?.requestType).toBe('friend')
  })
})

describe('@OnMessageSent 装饰器', () => {
  it('应注册 message_sent 事件类型', () => {
    function sentHandler() {
      /* noop */
    }
    OnMessageSent()(sentHandler)

    const meta = handlerRegistry.get(sentHandler)?.[0]
    expect(meta?.eventType).toBe('message_sent')
  })
})

describe('@OnPoke 装饰器', () => {
  it('应注册 poke notify 元数据', () => {
    function pokeHandler() {
      /* noop */
    }
    OnPoke()(pokeHandler)

    const meta = handlerRegistry.get(pokeHandler)?.[0]
    expect(meta?.eventType).toBe('notice')
    expect(meta?.noticeType).toBe('notify')
    expect(meta?.subType).toBe('poke')
  })
})

describe('@OnEssence 装饰器', () => {
  it('应注册 essence 通知元数据', () => {
    function essenceHandler() {
      /* noop */
    }
    OnEssence('add')(essenceHandler)

    const meta = handlerRegistry.get(essenceHandler)?.[0]
    expect(meta?.noticeType).toBe('essence')
    expect(meta?.subType).toBe('add')
  })
})

describe('@OnBotOffline 装饰器', () => {
  it('应注册 bot_offline 元数据', () => {
    function offlineHandler() {
      /* noop */
    }
    OnBotOffline()(offlineHandler)

    const meta = handlerRegistry.get(offlineHandler)?.[0]
    expect(meta?.noticeType).toBe('bot_offline')
  })
})

describe('@Feature 装饰器', () => {
  it('应将功能注册到 featureRegistry', () => {
    Feature({
      name: 'scheduler',
      displayName: '定时任务',
      description: '定时功能',
      defaultEnabled: true,
    })(SchedulerFeature)

    expect(featureRegistry.has('scheduler')).toBe(true)
    const meta = featureRegistry.get('scheduler')
    expect(meta?.name).toBe('scheduler')
    expect(meta?.displayName).toBe('定时任务')
    expect(meta?.defaultEnabled).toBe(true)
    expect(meta?.target).toBe(SchedulerFeature)
  })
})
