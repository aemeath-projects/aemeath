// tests/unit/core/settings/path.test.ts
import { describe, expect, it } from 'vitest'

import { Path, toScope, parseScope, buildAncestorScopes } from '@/core/settings/path.js'

describe('Path 便捷构造函数', () => {
  it('system() 返回空数组', () => {
    expect(Path.system()).toEqual([])
  })

  it('group() 返回单段 group path', () => {
    expect(Path.group('123')).toEqual([{ type: 'group', id: '123' }])
  })

  it('groupMember() 返回 group+member 两段', () => {
    expect(Path.groupMember('123', '456')).toEqual([
      { type: 'group', id: '123' },
      { type: 'member', id: '456' },
    ])
  })

  it('private() 返回单段 private path', () => {
    expect(Path.private('789')).toEqual([{ type: 'private', id: '789' }])
  })

  it('segment 含 : 时抛出异常', () => {
    expect(() => Path.group('12:3')).toThrow('不合法')
  })

  it('segment 含 / 时抛出异常', () => {
    expect(() => Path.private('12/3')).toThrow('不合法')
  })
})

describe('toScope', () => {
  it('空 path 生成空串', () => {
    expect(toScope([])).toBe('')
  })

  it('单段 path 生成 type:id', () => {
    expect(toScope(Path.group('123'))).toBe('group:123')
  })

  it('多段 path 用 / 连接', () => {
    expect(toScope(Path.groupMember('123', '456'))).toBe('group:123/member:456')
  })
})

describe('parseScope', () => {
  it('空串解析为空数组', () => {
    expect(parseScope('')).toEqual([])
  })

  it('单段字符串正确解析', () => {
    expect(parseScope('group:123')).toEqual([{ type: 'group', id: '123' }])
  })

  it('多段字符串正确解析', () => {
    expect(parseScope('group:123/member:456')).toEqual([
      { type: 'group', id: '123' },
      { type: 'member', id: '456' },
    ])
  })

  it('toScope 与 parseScope 互逆', () => {
    const path = Path.groupMember('123', '456')
    expect(parseScope(toScope(path))).toEqual(path)
  })

  it('非法 scope 段抛出异常', () => {
    expect(() => parseScope('invalid-no-colon')).toThrow('非法 scope 段')
  })

  it('id 为空时抛出异常', () => {
    expect(() => parseScope('group:')).toThrow('不合法')
  })

  it('type 为空时抛出异常', () => {
    expect(() => parseScope(':123')).toThrow('不合法')
  })

  it('id 含额外冒号时抛出异常', () => {
    expect(() => parseScope('group:1:2')).toThrow('不合法')
  })

  it('业务自定义 type 的 path 可正常编码/解码且互逆', () => {
    const path: Path = [{ type: 'custom_domain', id: 'xyz' }]
    const scope = toScope(path)
    expect(scope).toBe('custom_domain:xyz')
    expect(parseScope(scope)).toEqual(path)
  })
})

describe('buildAncestorScopes', () => {
  it('系统级 path 只有一个候选（空串）', () => {
    expect(buildAncestorScopes([])).toEqual([''])
  })

  it('group path 候选从具体到根', () => {
    expect(buildAncestorScopes(Path.group('123'))).toEqual(['group:123', ''])
  })

  it('groupMember path 候选包含三层', () => {
    expect(buildAncestorScopes(Path.groupMember('123', '456'))).toEqual([
      'group:123/member:456',
      'group:123',
      '',
    ])
  })

  it('三层以上 path 候选从最具体到根，每层截断正确', () => {
    const path: Path = [
      { type: 'group', id: '1' },
      { type: 'member', id: '2' },
      { type: 'custom', id: '3' },
    ]
    expect(buildAncestorScopes(path)).toEqual([
      'group:1/member:2/custom:3',
      'group:1/member:2',
      'group:1',
      '',
    ])
  })
})
