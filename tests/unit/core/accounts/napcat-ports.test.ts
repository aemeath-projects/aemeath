import { describe, it, expect, vi } from 'vitest'

const sendGroupMsgMock = vi.fn()
const getGroupListMock = vi.fn()
const getFriendListMock = vi.fn()

vi.mock('@aemeath-projects/napcat', () => {
  const MessageApi = vi.fn(function (this: { sendGroupMsg: unknown }) {
    this.sendGroupMsg = sendGroupMsgMock
  })
  const GroupApi = vi.fn(function (this: { getGroupList: unknown }) {
    this.getGroupList = getGroupListMock
  })
  const FriendApi = vi.fn(function (this: { getFriendList: unknown }) {
    this.getFriendList = getFriendListMock
  })
  return { MessageApi, GroupApi, FriendApi }
})

const { createMessageApi, createGroupApi, createFriendApi } =
  await import('@/core/accounts/napcat-ports.js')
const { MessageApi, GroupApi, FriendApi } = await import('@aemeath-projects/napcat')

describe('napcat-ports 工厂函数', () => {
  it('createMessageApi 用传入的 client 构造 MessageApi 实例', () => {
    const client = { id: 'c1' }
    const api = createMessageApi(client as never)

    expect(MessageApi).toHaveBeenCalledWith(client)
    expect(api.sendGroupMsg).toBe(sendGroupMsgMock)
  })

  it('createGroupApi 用传入的 client 构造 GroupApi 实例', () => {
    const client = { id: 'c2' }
    const api = createGroupApi(client as never)

    expect(GroupApi).toHaveBeenCalledWith(client)
    expect(api.getGroupList).toBe(getGroupListMock)
  })

  it('createFriendApi 用传入的 client 构造 FriendApi 实例', () => {
    const client = { id: 'c3' }
    const api = createFriendApi(client as never)

    expect(FriendApi).toHaveBeenCalledWith(client)
    expect(api.getFriendList).toBe(getFriendListMock)
  })
})
