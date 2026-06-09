import { describe, expect, it } from 'vitest'

import { parseEvent } from '@/core/protocol/event.js'
import type {
  GroupMessageEvent,
  HeartbeatEvent,
  LifecycleEvent,
  NoticeEvent,
} from '@/core/protocol/models/events.js'

describe('parseEvent', () => {
  it('should parse a group message event', () => {
    const raw = {
      time: 1700000000,
      self_id: 10000,
      post_type: 'message',
      message_type: 'group',
      sub_type: 'normal',
      message_id: 1234,
      group_id: 99999,
      user_id: 11111,
      message: [{ type: 'text', data: { text: 'hello' } }],
      raw_message: 'hello',
      font: 0,
      sender: { user_id: 11111, nickname: 'tester', role: 'member' },
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('message')

    const groupEvent = event as GroupMessageEvent
    expect(groupEvent.message_type).toBe('group')
    expect(groupEvent.group_id).toBe(99999)
    expect(groupEvent.user_id).toBe(11111)
  })

  it('should parse a private message event', () => {
    const raw = {
      time: 1700000001,
      self_id: 10000,
      post_type: 'message',
      message_type: 'private',
      sub_type: 'friend',
      message_id: 5678,
      user_id: 22222,
      message: 'hi',
      raw_message: 'hi',
      font: 0,
      sender: { user_id: 22222, nickname: 'friend' },
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('message')
    const asMsg = event as { message_type: string }
    expect(asMsg.message_type).toBe('private')
  })

  it('should parse a heartbeat meta event', () => {
    const raw = {
      time: 1700000002,
      self_id: 10000,
      post_type: 'meta_event',
      meta_event_type: 'heartbeat',
      status: { online: true, good: true },
      interval: 30000,
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('meta_event')

    const heartbeat = event as HeartbeatEvent
    expect(heartbeat.meta_event_type).toBe('heartbeat')
    expect(heartbeat.interval).toBe(30000)
  })

  it('should parse a lifecycle meta event', () => {
    const raw = {
      time: 1700000003,
      self_id: 10000,
      post_type: 'meta_event',
      meta_event_type: 'lifecycle',
      sub_type: 'connect',
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('meta_event')

    const lifecycle = event as LifecycleEvent
    expect(lifecycle.meta_event_type).toBe('lifecycle')
  })

  it('should parse a group increase notice event', () => {
    const raw = {
      time: 1700000004,
      self_id: 10000,
      post_type: 'notice',
      notice_type: 'group_increase',
      sub_type: 'approve',
      group_id: 88888,
      user_id: 33333,
      operator_id: 44444,
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('notice')

    const notice = event as NoticeEvent & { group_id: number }
    expect(notice.notice_type).toBe('group_increase')
    expect(notice.group_id).toBe(88888)
  })

  it('should parse a poke notify event', () => {
    const raw = {
      time: 1700000005,
      self_id: 10000,
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'poke',
      group_id: 88888,
      user_id: 33333,
      target_id: 10000,
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('notice')

    const notice = event as NoticeEvent
    expect(notice.notice_type).toBe('notify')
    expect(notice.sub_type).toBe('poke')
  })

  it('should parse a friend request event', () => {
    const raw = {
      time: 1700000006,
      self_id: 10000,
      post_type: 'request',
      request_type: 'friend',
      user_id: 55555,
      comment: 'add me',
      flag: 'abc123',
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('request')
    const asReq = event as { request_type: string }
    expect(asReq.request_type).toBe('friend')
  })

  it('should parse a group request event', () => {
    const raw = {
      time: 1700000007,
      self_id: 10000,
      post_type: 'request',
      request_type: 'group',
      sub_type: 'add',
      group_id: 77777,
      user_id: 66666,
      comment: '',
      flag: 'def456',
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('request')
    const asReq = event as { request_type: string }
    expect(asReq.request_type).toBe('group')
  })

  it('should return base event for unknown post_type', () => {
    const raw = {
      time: 1700000008,
      self_id: 10000,
      post_type: 'totally_unknown',
    }

    const event = parseEvent(raw)
    expect(event.post_type).toBe('totally_unknown')
    expect(event.time).toBe(1700000008)
  })

  it('should handle non-object input gracefully', () => {
    const event = parseEvent(null)
    expect(event.time).toBe(0)
    expect(event.post_type).toBe('unknown')
  })

  it('should handle string input gracefully', () => {
    const event = parseEvent('not an object')
    expect(event.time).toBe(0)
  })
})
