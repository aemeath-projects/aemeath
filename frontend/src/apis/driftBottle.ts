/** 漂流瓶功能的 API 封装。 */

import { get, post, del } from './http'

export interface PoolInfo {
  id: number
  name: string
  availableCount: number
}

export interface PoolGroupsResponse {
  poolId: number
  groupIds: number[]
}

/** 列出所有漂流瓶池（含未捞取瓶数统计） */
export async function listPools(): Promise<PoolInfo[]> {
  return get<PoolInfo[]>('/api/drift-bottle-pools')
}

/** 创建新漂流瓶池 */
export async function createPool(name: string): Promise<{ id: number; name: string }> {
  return post<{ id: number; name: string }>('/api/drift-bottle-pools', { name })
}

/** 删除漂流瓶池（id=0 的默认池后端会拒绝） */
export async function deletePool(poolId: number): Promise<void> {
  await del<null>(`/api/drift-bottle-pools/${poolId}`)
}

/** 列出指定池下所有群号 */
export async function listPoolGroups(poolId: number): Promise<PoolGroupsResponse> {
  return get<PoolGroupsResponse>(`/api/drift-bottle-pools/${poolId}/groups`)
}

/** 将群分配到指定池（poolId=0 = 移回默认池） */
export async function assignGroupPool(groupId: string, poolId: number): Promise<void> {
  await post<null>('/api/drift-bottle-pools/group-assign', { groupId, poolId })
}
