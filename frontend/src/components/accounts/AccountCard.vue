<script setup lang="ts">
import { computed } from 'vue'
import type { Account, AccountStatus } from '@/apis/accounts'

const props = defineProps<{
  account: Account
  status?: AccountStatus
  loading?: boolean
}>()

const emit = defineEmits<{
  connect: [id: number]
  disconnect: [id: number]
  edit: [account: Account]
  delete: [id: number]
}>()

const stateColor: Record<string, string> = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'error',
  unknown: 'default',
}

const stateLabel: Record<string, string> = {
  connected: '在线',
  connecting: '连接中',
  disconnected: '离线',
  unknown: '未知',
}

const currentState = computed(() => props.status?.state ?? 'unknown')
</script>

<template>
  <v-card elevation="1" class="h-100">
    <v-card-title class="d-flex align-center ga-2">
      <span class="text-body-1 font-weight-medium">{{ account.nickname ?? '未命名' }}</span>
      <v-chip :color="account.role === 'master' ? 'primary' : 'secondary'" size="x-small" label>
        {{ account.role }}
      </v-chip>
      <v-spacer />
      <v-badge :color="stateColor[currentState]" :content="stateLabel[currentState]" inline />
    </v-card-title>

    <v-card-subtitle class="text-caption">QQ: {{ account.qq }}</v-card-subtitle>

    <v-card-text>
      <div class="text-caption text-medium-emphasis text-truncate" :title="account.endpoint">
        {{ account.transport.toUpperCase() }} · {{ account.endpoint }}
      </div>
    </v-card-text>

    <v-card-actions>
      <v-btn
        v-if="currentState !== 'connected'"
        size="small"
        color="success"
        variant="tonal"
        :loading="loading"
        prepend-icon="mdi-connection"
        @click="emit('connect', account.id)"
      >
        连接
      </v-btn>
      <v-btn
        v-else
        size="small"
        color="warning"
        variant="tonal"
        :loading="loading"
        prepend-icon="mdi-lan-disconnect"
        @click="emit('disconnect', account.id)"
      >
        断开
      </v-btn>
      <v-spacer />
      <v-btn size="small" icon="mdi-pencil" variant="text" @click="emit('edit', account)" />
      <v-btn
        size="small"
        icon="mdi-delete"
        variant="text"
        color="error"
        @click="emit('delete', account.id)"
      />
    </v-card-actions>
  </v-card>
</template>
