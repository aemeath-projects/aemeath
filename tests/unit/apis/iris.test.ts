import { describe, it, expect } from 'vitest'

import { matchesStreamTarget } from '@/apis/iris.js'

describe('matchesStreamTarget()', () => {
  it('groupId 模式：groupId 匹配即命中，不管 messageType', () => {
    expect(
      matchesStreamTarget(
        { groupId: '123456', userId: '1', messageType: 2 },
        { groupId: '123456' },
      ),
    ).toBe(true)
    expect(
      matchesStreamTarget(
        { groupId: '123456', userId: '1', messageType: 3 },
        { groupId: '123456' },
      ),
    ).toBe(true)
  })

  it('groupId 模式：groupId 不匹配则不命中', () => {
    expect(
      matchesStreamTarget(
        { groupId: '999999', userId: '1', messageType: 2 },
        { groupId: '123456' },
      ),
    ).toBe(false)
  })

  it('userId 模式：userId 匹配且 messageType=1（私聊）才命中', () => {
    expect(
      matchesStreamTarget(
        { groupId: null, userId: '987654', messageType: 1 },
        { userId: '987654' },
      ),
    ).toBe(true)
  })

  it('userId 模式：messageType 不为 1（如自发送）则不命中', () => {
    expect(
      matchesStreamTarget(
        { groupId: null, userId: '987654', messageType: 3 },
        { userId: '987654' },
      ),
    ).toBe(false)
  })

  it('userId 模式：userId 不匹配则不命中', () => {
    expect(
      matchesStreamTarget({ groupId: null, userId: '111', messageType: 1 }, { userId: '987654' }),
    ).toBe(false)
  })

  it('groupId 与 userId 均未指定时返回 false', () => {
    expect(matchesStreamTarget({ groupId: '123456', userId: '1', messageType: 2 }, {})).toBe(false)
  })
})
