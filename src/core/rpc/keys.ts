/**
 * RPC 模块的 Redis 缓存键定义 —— 对应 Python 侧的 key_registry 实现。
 */

/** RPC 请求队列键（Redis List），Worker → 主进程。 */
export function rpcRequestQueueKey(): string {
  return 'aemeath:rpc:requests'
}

/**
 * RPC 响应通道键（Redis Pub/Sub），主进程 → Worker。
 *
 * @param requestId - 请求 UUID
 */
export function rpcResponseChannelKey(requestId: string): string {
  return `aemeath:rpc:resp:${requestId}`
}
