/**
 * Settings scope 路径类型与转换函数 —— 树状 scope 的唯一权威实现。
 * 全代码库生成/解析 scope 字符串必须经过本文件的 toScope()/parseScope()，禁止手拼字符串。
 */

import { ValidationError } from '@/core/errors.js'

/** 禁止包含 ':' 和 '/'，避免 segment 内容与 scope 拼接分隔符冲突导致跨 scope 碰撞。 */
const SEGMENT_ID_PATTERN = /^[^:/]+$/

export interface PathSegment {
  readonly type: string
  readonly id: string
}

export type Path = readonly PathSegment[]

function assertValidSegment(segment: PathSegment): void {
  if (!SEGMENT_ID_PATTERN.test(segment.type) || !SEGMENT_ID_PATTERN.test(segment.id)) {
    throw new ValidationError(
      `[settings] scope segment 不合法（禁止包含 ':' 或 '/'）: ${JSON.stringify(segment)}`,
    )
  }
}

/** 框架内置便捷构造函数，其余任意嵌套由业务直接构造数组字面量。 */
export const Path = {
  system: (): Path => [],
  group: (groupId: string): Path => {
    const seg: PathSegment = { type: 'group', id: groupId }
    assertValidSegment(seg)
    return [seg]
  },
  groupMember: (groupId: string, userId: string): Path => {
    const group: PathSegment = { type: 'group', id: groupId }
    const member: PathSegment = { type: 'member', id: userId }
    assertValidSegment(group)
    assertValidSegment(member)
    return [group, member]
  },
  private: (userId: string): Path => {
    const seg: PathSegment = { type: 'private', id: userId }
    assertValidSegment(seg)
    return [seg]
  },
}

/** 唯一的 scope 字符串生成入口。 */
export function toScope(path: Path): string {
  for (const segment of path) assertValidSegment(segment)
  return path.map((s) => `${s.type}:${s.id}`).join('/')
}

/** 将 scope 字符串解析回 Path（无损可逆），供调试/管理后台展示使用。 */
export function parseScope(scope: string): Path {
  if (scope === '') return []
  return scope.split('/').map((segStr) => {
    const idx = segStr.indexOf(':')
    if (idx === -1) throw new ValidationError(`[settings] 非法 scope 段: ${segStr}`)
    const seg: PathSegment = { type: segStr.slice(0, idx), id: segStr.slice(idx + 1) }
    assertValidSegment(seg)
    return seg
  })
}

/**
 * 从叶子到根生成候选 scope 列表（索引 0 最具体/最深，最后一项恒为系统级 ""）。
 * 例如 Path.groupMember('123','456') → ["group:123/member:456", "group:123", ""]
 */
export function buildAncestorScopes(path: Path): string[] {
  const candidates: string[] = []
  for (let i = path.length; i >= 0; i--) {
    candidates.push(toScope(path.slice(0, i)))
  }
  return candidates
}
