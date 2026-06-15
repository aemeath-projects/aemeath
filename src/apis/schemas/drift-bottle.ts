/**
 * 漂流瓶 API 请求/响应 Schema（TypeBox）。
 */

import { Type } from '@sinclair/typebox'

/** 创建漂流瓶池请求 Schema。 */
export const CreatePoolRequestSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 64, description: '池名称' }),
})

/** 群池分配请求 Schema。 */
export const GroupAssignRequestSchema = Type.Object({
  groupId: Type.Number({ description: '群号' }),
  poolId: Type.Number({ minimum: 0, description: '目标池 id，0=移回默认池' }),
})

/** 漂流瓶池信息响应 Schema。 */
export const PoolInfoResponseSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  availableCount: Type.Number({ description: '当前未被捞取的漂流瓶数量' }),
})

/** 池下群列表响应 Schema。 */
export const PoolGroupsResponseSchema = Type.Object({
  poolId: Type.Number(),
  groupIds: Type.Array(Type.Number()),
})

/* TypeScript 接口 */

export interface CreatePoolRequest {
  name: string
}

export interface GroupAssignRequest {
  groupId: number
  poolId: number
}
