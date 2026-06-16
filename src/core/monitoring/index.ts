/** 监控指标统一导出。 */
export { MetricRegistry, metricRegistry } from './registry.js'
export {
  metricsRegistry,
  wsConnected,
  wsMessagesReceived,
  wsMessagesSent,
  eventProcessed,
  eventProcessingSeconds,
  eventErrors,
  apiCalls,
  apiCallDuration,
  apiCallErrors,
  handlersRegistered,
  uptimeSeconds,
  httpRequestsTotal,
  httpRequestDuration,
} from './metrics.js'
