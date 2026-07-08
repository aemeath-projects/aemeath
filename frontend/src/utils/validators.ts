/** 表单校验规则集合 —— 供 Vuetify v-text-field/v-select 等的 :rules 使用。 */

export const requiredRule = (v: unknown): true | string =>
  v != null && String(v).trim() !== '' ? true : '必填'

const ENDPOINT_PATTERN = /^(wss?|https?):\/\/\S+$/

/** endpoint 必须以 ws:// wss:// http:// https:// 开头；空值交给 requiredRule 处理，这里放行。 */
export const endpointRule = (v: unknown): true | string => {
  const value = String(v ?? '').trim()
  if (value === '') return true
  return ENDPOINT_PATTERN.test(value) ? true : 'Endpoint 必须以 ws:// wss:// http:// https:// 开头'
}
