/**
 * HTTP 客户端 —— 统一封装 axios，自动解包后端信封 {code, data, message}，注入 Auth token。
 */

import axios from 'axios'
import type { AxiosInstance } from 'axios'

/** 后端统一响应信封 */
interface ApiEnvelope<T> {
  code: number
  data: T
  message: string
}

/** 后端业务错误（code !== 0） */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const http: AxiosInstance = axios.create({
  timeout: 30000,
})

/** 请求拦截器：注入 Bearer token */
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 响应拦截器：HTTP 错误日志 */
http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    if (status === 401) console.error('[HTTP 401] 未授权', error.config?.url)
    else if (status === 403) console.error('[HTTP 403] 无权限', error.config?.url)
    return Promise.reject(error)
  },
)

/** 解包信封，code !== 0 时抛出 ApiError */
function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (envelope.code !== 0) throw new ApiError(envelope.code, envelope.message)
  return envelope.data
}

/** GET 请求，自动解包 */
export function get<T>(url: string, params?: object): Promise<T> {
  return http.get<ApiEnvelope<T>>(url, { params }).then((r) => unwrap(r.data))
}

/** POST 请求，自动解包 */
export function post<T>(url: string, body?: object): Promise<T> {
  return http.post<ApiEnvelope<T>>(url, body).then((r) => unwrap(r.data))
}

/** PUT 请求，自动解包 */
export function put<T>(url: string, body?: object): Promise<T> {
  return http.put<ApiEnvelope<T>>(url, body).then((r) => unwrap(r.data))
}

/** DELETE 请求，自动解包 */
export function del<T>(url: string): Promise<T> {
  return http.delete<ApiEnvelope<T>>(url).then((r) => unwrap(r.data))
}

export default http
