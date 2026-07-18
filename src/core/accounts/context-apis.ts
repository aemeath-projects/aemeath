import type { AggregatedEvent, ClientPool } from '@aemeath-projects/exostrider/pool'
import type { NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent, MessageSegment } from '@aemeath-projects/napcat/types'

import { createFriendApi, createGroupApi, createMessageApi } from './napcat-ports.js'
import type { FriendApiPort, GroupApiPort, MessageApiPort } from './napcat-ports.js'
import type { AccountRole } from './roles.js'
import type { MessageRouter } from './router.js'

import type { ContextApis } from '@/core/dispatch/index.js'

export function buildContextApis(
  aggregated: AggregatedEvent<AnyOneBotEvent>,
  router: MessageRouter,
  pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>,
): ContextApis {
  const sourceAdapter = pool.getClient(aggregated.sourceClientId)
  const sourceClient = sourceAdapter?.client

  // groupApi 默认绑定 Router 选号结果，与 msgApi.sendGroupMsg 指向同一账号；
  // 只有群事件才能解析出 groupId，私聊事件或解析失败时回退到事件源客户端。
  const groupIdForResolve = (aggregated.event as { groupId?: number } | undefined)?.groupId
  const resolvedGroupClient =
    groupIdForResolve != null ? router.resolveGroupClient(String(groupIdForResolve)) : null
  const groupClient = resolvedGroupClient ?? sourceClient
  const groupApi = groupClient ? createGroupApi(groupClient) : null

  // friendApi 不涉及群路由选择，继续绑定事件来源客户端（好友关系是账号自身属性）
  const friendApi = sourceClient ? createFriendApi(sourceClient) : null

  // msgApi 作为代理：sendGroupMsg 委托给 MessageRouter。
  // 注意：msgApi 对外类型是 MessageApiPort（真实调用方按该接口传 groupId: number），
  // 而 MessageRouter/GroupBotRegistry 内部一律用 String(groupId) 作为 Map key——
  // 这里必须做一次显式转换，否则数字类型的 groupId 永远查不到按字符串注册的账号，
  // 会被误判为"当前群无可用账号发送消息"
  const msgApi = new Proxy(sourceClient ? createMessageApi(sourceClient) : ({} as MessageApiPort), {
    get(target, prop) {
      if (prop === 'sendGroupMsg') {
        return (groupId: number, message: MessageSegment[]) =>
          router.sendGroupMsg(String(groupId), message)
      }
      if (prop === 'sendPrivateMsg') {
        return (userId: number, message: MessageSegment[]) =>
          router.sendPrivateMsg(String(userId), message)
      }
      return Reflect.get(target, prop) as unknown
    },
  })

  return {
    msgApi,
    // groupApi/friendApi 可能为 null（无连接），handler 层应检查；此处类型断言保持接口兼容
    groupApi: (groupApi ?? null) as unknown as GroupApiPort,
    friendApi: (friendApi ?? null) as unknown as FriendApiPort,
  }
}
