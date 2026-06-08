/**
 * Prometheus 指标定义 —— 对应 Python 侧的 prometheus_client 指标。
 */

import { Counter, Gauge, Histogram, Registry } from 'prom-client'

/** 全局指标注册表（独立实例，避免污染 prom-client 默认注册表）。 */
export const metricsRegistry = new Registry()

// ── WebSocket 指标 ──

export const wsConnected = new Gauge({
  name: 'aemeath_ws_connected',
  help: 'Number of active NapCat WS connections',
  registers: [metricsRegistry],
})

export const wsMessagesReceived = new Counter({
  name: 'aemeath_ws_messages_received_total',
  help: 'WS messages received from NapCat',
  labelNames: ['post_type'] as const,
  registers: [metricsRegistry],
})

export const wsMessagesSent = new Counter({
  name: 'aemeath_ws_messages_sent_total',
  help: 'WS messages sent to NapCat',
  registers: [metricsRegistry],
})

// ── 事件处理指标 ──

export const eventProcessed = new Counter({
  name: 'aemeath_event_processed_total',
  help: 'Events processed',
  labelNames: ['event_type', 'handler'] as const,
  registers: [metricsRegistry],
})

export const eventProcessingSeconds = new Histogram({
  name: 'aemeath_event_processing_seconds',
  help: 'Event processing duration in seconds',
  registers: [metricsRegistry],
})

export const eventErrors = new Counter({
  name: 'aemeath_event_errors_total',
  help: 'Event processing errors',
  registers: [metricsRegistry],
})

// ── API 调用指标 ──

export const apiCalls = new Counter({
  name: 'aemeath_api_calls_total',
  help: 'OneBot API calls',
  labelNames: ['action'] as const,
  registers: [metricsRegistry],
})

export const apiCallDuration = new Histogram({
  name: 'aemeath_api_call_duration_seconds',
  help: 'OneBot API call duration',
  registers: [metricsRegistry],
})

export const apiCallErrors = new Counter({
  name: 'aemeath_api_call_errors_total',
  help: 'OneBot API call failures',
  registers: [metricsRegistry],
})

// ── 处理器指标 ──

export const handlersRegistered = new Gauge({
  name: 'aemeath_handlers_registered',
  help: 'Number of registered handler methods',
  registers: [metricsRegistry],
})

// ── RPC 指标 ──

export const rpcCallsTotal = new Counter({
  name: 'aemeath_rpc_calls_total',
  help: 'RPC calls initiated by Worker via bridge',
  labelNames: ['action', 'success'] as const,
  registers: [metricsRegistry],
})

export const rpcCallDurationSeconds = new Histogram({
  name: 'aemeath_rpc_call_duration_seconds',
  help: 'End-to-end RPC call duration as measured by the bridge (seconds)',
  registers: [metricsRegistry],
})

export const rpcHandlerExecSeconds = new Histogram({
  name: 'aemeath_rpc_handler_exec_seconds',
  help: 'RPC handler execution duration on the consumer side (seconds)',
  labelNames: ['action'] as const,
  registers: [metricsRegistry],
})

export const rpcInflight = new Gauge({
  name: 'aemeath_rpc_inflight',
  help: 'Number of in-flight RPC handler tasks',
  registers: [metricsRegistry],
})

export const rpcRegisteredHandlers = new Gauge({
  name: 'aemeath_rpc_registered_handlers',
  help: 'Number of registered RPC action handlers',
  registers: [metricsRegistry],
})

// ── 系统指标 ──

export const uptimeSeconds = new Gauge({
  name: 'aemeath_uptime_seconds',
  help: 'Process uptime in seconds',
  registers: [metricsRegistry],
})

// ── 人员管理指标 ──

export const personnelSyncTotal = new Counter({
  name: 'aemeath_personnel_sync_total',
  help: 'Personnel sync task executions',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
})

export const personnelSyncDuration = new Histogram({
  name: 'aemeath_personnel_sync_duration_seconds',
  help: 'Personnel sync task duration (from data collection to DB write)',
  registers: [metricsRegistry],
})

export const personnelUsersTotal = new Gauge({
  name: 'aemeath_personnel_users_total',
  help: 'Total known users in the users table',
  registers: [metricsRegistry],
})

export const personnelFriendsTotal = new Gauge({
  name: 'aemeath_personnel_friends_total',
  help: 'Total friends (relation=friend)',
  registers: [metricsRegistry],
})

export const personnelGroupsTotal = new Gauge({
  name: 'aemeath_personnel_groups_total',
  help: 'Total active groups (is_active=True)',
  registers: [metricsRegistry],
})

export const personnelAdminsTotal = new Gauge({
  name: 'aemeath_personnel_admins_total',
  help: 'Total admins (relation=admin)',
  registers: [metricsRegistry],
})

export const personnelMembershipsTotal = new Gauge({
  name: 'aemeath_personnel_memberships_total',
  help: 'Total active group memberships',
  registers: [metricsRegistry],
})

export const personnelSyncLastSuccessTs = new Gauge({
  name: 'aemeath_personnel_sync_last_success_timestamp',
  help: 'Unix timestamp of the last successful personnel sync',
  registers: [metricsRegistry],
})

export const personnelApiErrors = new Counter({
  name: 'aemeath_personnel_api_errors_total',
  help: 'Personnel sync API call failures',
  labelNames: ['action'] as const,
  registers: [metricsRegistry],
})

// ── HTTP 请求指标 ──

export const httpRequestsTotal = new Counter({
  name: 'aemeath_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
})

export const httpRequestDuration = new Histogram({
  name: 'aemeath_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [metricsRegistry],
})
