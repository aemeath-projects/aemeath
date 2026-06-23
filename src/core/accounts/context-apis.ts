import type { AggregatedEvent, ClientPool } from '@aemeath-projects/exostrider/pool'
import { MessageApi, GroupApi, FriendApi } from '@aemeath-projects/napcat'
import type { NapCatClient } from '@aemeath-projects/napcat'
import type { AnyOneBotEvent, MessageSegment } from '@aemeath-projects/napcat/types'

import type { AccountRole } from './roles.js'
import type { MessageRouter } from './router.js'

import type { ContextApis } from '@/core/dispatch/index.js'

export function buildContextApis(
  aggregated: AggregatedEvent<AnyOneBotEvent>,
  router: MessageRouter,
  pool: ClientPool<NapCatClient, AccountRole, AnyOneBotEvent>,
): ContextApis {
  const sourceAdapter = pool.getClient(aggregated.sourceClientId)

  // 非路由 API 直接使用事件来源客户端
  const sourceClient = sourceAdapter?.client
  const groupApi = sourceClient ? new GroupApi(sourceClient) : null
  const friendApi = sourceClient ? new FriendApi(sourceClient) : null

  // msgApi 作为代理：sendGroupMsg 委托给 MessageRouter
  const msgApi = new Proxy(sourceClient ? new MessageApi(sourceClient) : ({} as MessageApi), {
    get(target, prop) {
      if (prop === 'sendGroupMsg') {
        return (groupId: bigint, message: MessageSegment[]) => router.sendGroupMsg(groupId, message)
      }
      return Reflect.get(target, prop) as unknown
    },
  })

  return {
    msgApi,
    // groupApi/friendApi 可能为 null（无连接），handler 层应检查；此处类型断言保持接口兼容
    groupApi: (groupApi ?? null) as unknown as GroupApi,
    friendApi: (friendApi ?? null) as unknown as FriendApi,
  }
}
