/** 表单校验规则单元测试：必填、endpoint 协议前缀。 */
import { describe, it, expect } from 'vitest'
import { requiredRule, endpointRule } from '@/utils/validators'

describe('requiredRule', () => {
  it('空字符串返回错误提示', () => {
    expect(requiredRule('')).toBe('必填')
  })

  it('空白字符串返回错误提示', () => {
    expect(requiredRule('   ')).toBe('必填')
  })

  it('null 返回错误提示', () => {
    expect(requiredRule(null)).toBe('必填')
  })

  it('undefined 返回错误提示', () => {
    expect(requiredRule(undefined)).toBe('必填')
  })

  it('非空字符串返回 true', () => {
    expect(requiredRule('abc')).toBe(true)
  })
})

describe('endpointRule', () => {
  it('空值放行（交给 requiredRule 处理）', () => {
    expect(endpointRule('')).toBe(true)
    expect(endpointRule(undefined)).toBe(true)
  })

  it('缺少协议前缀（如 "127.0.0.1:6100"）返回错误提示', () => {
    expect(endpointRule('127.0.0.1:6100')).not.toBe(true)
  })

  it('非法协议前缀（如 ftp://）返回错误提示', () => {
    expect(endpointRule('ftp://127.0.0.1:6100')).not.toBe(true)
  })

  it.each(['ws://127.0.0.1:6100', 'wss://example.com', 'http://127.0.0.1:6100', 'https://example.com'])(
    '合法协议前缀 %s 返回 true',
    (value) => {
      expect(endpointRule(value)).toBe(true)
    },
  )
})
