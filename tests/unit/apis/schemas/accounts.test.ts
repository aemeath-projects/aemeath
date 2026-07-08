import { Value } from '@sinclair/typebox/value'
import { describe, expect, it } from 'vitest'

import { CreateAccountBodySchema, UpdateAccountBodySchema } from '@/apis/schemas/accounts.js'

function baseCreateBody(endpoint: string) {
  return {
    qq: '1739280698',
    role: 'normal' as const,
    transport: 'ws' as const,
    endpoint,
  }
}

describe('CreateAccountBodySchema.endpoint 协议前缀校验', () => {
  it('拒绝缺少协议前缀的 endpoint（如 "127.0.0.1:6100"）', () => {
    expect(Value.Check(CreateAccountBodySchema, baseCreateBody('127.0.0.1:6100'))).toBe(false)
  })

  it('拒绝非法协议前缀（如 ftp://）', () => {
    expect(Value.Check(CreateAccountBodySchema, baseCreateBody('ftp://127.0.0.1:6100'))).toBe(false)
  })

  it.each([
    'ws://127.0.0.1:6100',
    'wss://example.com',
    'http://127.0.0.1:6100',
    'https://example.com',
  ])('接受合法协议前缀 %s', (endpoint) => {
    expect(Value.Check(CreateAccountBodySchema, baseCreateBody(endpoint))).toBe(true)
  })
})

describe('UpdateAccountBodySchema.endpoint 协议前缀校验', () => {
  it('拒绝缺少协议前缀的 endpoint', () => {
    expect(Value.Check(UpdateAccountBodySchema, { endpoint: '127.0.0.1:6100' })).toBe(false)
  })

  it('接受合法协议前缀', () => {
    expect(Value.Check(UpdateAccountBodySchema, { endpoint: 'ws://127.0.0.1:6100' })).toBe(true)
  })

  it('省略 endpoint 字段时仍然合法（可选字段，不影响其他字段更新）', () => {
    expect(Value.Check(UpdateAccountBodySchema, { nickname: '新昵称' })).toBe(true)
  })
})
