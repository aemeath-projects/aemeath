/** Bot 基本信息与资料的 API 封装。 */
import http from '@/apis/client'

export interface BotInfo {
  nickname: string | null
  userId: number | null
  avatarUrl: string | null
}

export interface BotVersionInfo {
  appName: string
  appVersion: string
  protocolVersion: string
}

export interface BotProfile {
  nickname: string | null
  userId: number | null
  avatarUrl: string | null
  online: boolean
  version: BotVersionInfo
}

export interface BotProfileUpdate {
  nickname?: string
  personalNote?: string
}

export function getBotInfo() {
  return http.get<{ code: number; data: BotInfo }>('/api/bot/info')
}

export function getBotProfile() {
  return http.get<{ code: number; data: BotProfile }>('/api/bot/profile')
}

export function updateBotProfile(data: BotProfileUpdate) {
  return http.put<{ code: number; data: Record<string, never> }>('/api/bot/profile', data)
}
