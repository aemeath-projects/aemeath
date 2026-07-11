<script setup lang="ts">
import { computed } from 'vue'
import type { AccountWithStatus } from '@/apis/accounts'

const props = defineProps<{
  account: AccountWithStatus
  toggling?: boolean
}>()

const emit = defineEmits<{
  'toggle-enabled': [qq: string, value: boolean]
  edit: [account: AccountWithStatus]
  delete: [qq: string]
}>()

const stateBgColor: Record<string, string> = {
  connected: '#e8f5e9',
  connecting: '#fff8e1',
  reconnecting: '#ffe0b2',
  disconnected: '#ffebee',
  unknown: '',
}

const stateLabel: Record<string, string> = {
  connected: '在线',
  connecting: '连接中',
  reconnecting: '重连中',
  disconnected: '离线',
  unknown: '未知',
}

const roleLabel: Record<string, string> = {
  master: '主账号',
  normal: '普通账号',
  readonly: '只读账号',
}

const roleColor: Record<string, string> = {
  master: '#d32f2f',
  normal: '#1976d2',
  readonly: '#fbc02d',
}

const cardBgColor = computed(() => stateBgColor[props.account.state] || '')

function onToggle(value: boolean | null) {
  emit('toggle-enabled', props.account.qq, value ?? false)
}
</script>

<template>
  <v-card elevation="1" class="h-100" :color="cardBgColor || undefined">
    <v-card-title class="d-flex align-center ga-2">
      <span class="text-body-1 font-weight-medium">{{ account.nickname ?? '未命名' }}</span>
      <v-chip :color="roleColor[account.role]" variant="flat" label size="small">
        {{ roleLabel[account.role] ?? account.role }}
      </v-chip>
      <v-spacer />
      <span class="text-medium-emphasis" style="font-size: 0.7rem">{{
        stateLabel[account.state]
      }}</span>
    </v-card-title>

    <v-card-subtitle class="text-caption">{{ account.qq }}</v-card-subtitle>

    <v-card-text>
      <div class="text-caption text-medium-emphasis text-truncate" :title="account.endpoint">
        {{ account.transport.toUpperCase() }} | {{ account.endpoint }}
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        v-if="account.isEnabled"
        variant="tonal"
        color="error"
        size="small"
        class="ml-2"
        :loading="toggling"
        @click="onToggle(false)"
      >
        停用
      </v-btn>
      <v-btn
        v-else
        variant="tonal"
        color="success"
        size="small"
        class="ml-2"
        :loading="toggling"
        @click="onToggle(true)"
      >
        启用
      </v-btn>
      <v-spacer />
      <v-btn icon="mdi-pencil" variant="text" @click="emit('edit', account)" />
      <v-btn icon="mdi-delete" variant="text" color="error" @click="emit('delete', account.qq)" />
    </v-card-actions>
  </v-card>
</template>
