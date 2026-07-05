<template>
  <PageLayout>
    <v-card flat>
      <!-- 筛选栏 -->
      <v-card-title class="d-flex align-center flex-wrap ga-2 pt-3">
        <GroupAutocomplete
          v-model="filter.groupId"
          label="群号"
          style="max-width: 200px"
          @update:model-value="loadPage(1)"
        />
        <UserAutocomplete
          v-model="filter.userId"
          label="用户 QQ"
          style="max-width: 200px"
          @update:model-value="loadPage(1)"
        />
        <v-text-field
          v-model="filter.date"
          label="日期"
          density="compact"
          variant="solo-filled"
          hide-details
          clearable
          type="date"
          style="max-width: 180px"
          @update:model-value="loadPage(1)"
        />
      </v-card-title>

      <v-skeleton-loader v-if="loading && !items.length" type="table" class="pa-2" />
      <v-data-table
        v-else
        :headers="headers"
        :items="items"
        :items-length="total"
        :loading="loading"
        :page="page"
        :items-per-page="pageSize"
        :items-per-page-options="[10, 20, 50]"
        hover
        @update:page="loadPage"
        @update:items-per-page="onPageSizeChange"
      >
        <!-- 群聊列 -->
        <template #[`item.groupId`]="{ item }">
          <div class="d-flex align-center ga-2 cursor-pointer" @click="openGroupInfo(item.groupId)">
            <v-avatar size="24">
              <v-img :src="`https://p.qlogo.cn/gh/${item.groupId}/${item.groupId}/40`">
                <template #error>
                  <v-icon size="20">mdi-account-group</v-icon>
                </template>
              </v-img>
            </v-avatar>
            <span class="text-caption"
              >{{ userStore.getGroupName(item.groupId) }}（{{ item.groupId }}）</span
            >
          </div>
        </template>

        <!-- 用户列 -->
        <template #[`item.userId`]="{ item }">
          <div
            class="d-flex align-center ga-2 cursor-pointer"
            @click="openUserInfo(item.userId, item.groupId)"
          >
            <v-avatar size="24">
              <v-img :src="`https://q1.qlogo.cn/g?b=qq&nk=${item.userId}&s=40`">
                <template #error>
                  <v-icon size="20">mdi-account-circle</v-icon>
                </template>
              </v-img>
            </v-avatar>
            <span class="text-caption"
              >{{ userStore.getUserName(item.userId) }}（{{ item.userId }}）</span
            >
          </div>
        </template>

        <!-- 签到时间列 -->
        <template #[`item.checkinAt`]="{ item }">
          <span class="text-caption text-medium-emphasis">{{ formatTime(item.checkinAt) }}</span>
        </template>
      </v-data-table>
    </v-card>

    <!-- 用户信息弹窗 -->
    <UserInfoCard v-model="userInfoDialog" :qq="userInfoQq" :group-id="userInfoGroupId" />

    <!-- 群聊信息弹窗 -->
    <GroupInfoCard v-model="groupInfoDialog" :group-id="groupInfoId" @open-user="openUserInfo" />
  </PageLayout>
</template>

<script setup lang="ts">
/**
 * 签到记录列表页面 —— 展示群签到记录，支持按群号、用户 QQ、日期筛选。
 */
import { onMounted, ref } from 'vue'

import * as checkinApi from '@/apis/checkin'
import type { CheckinRecord } from '@/apis/checkin'
import PageLayout from '@/layouts/PageLayout.vue'
import GroupInfoCard from '@/components/GroupInfoCard.vue'
import UserInfoCard from '@/components/UserInfoCard.vue'
import GroupAutocomplete from '@/components/GroupAutocomplete.vue'
import UserAutocomplete from '@/components/UserAutocomplete.vue'
import { formatTime } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import { usePagination } from '@/composables/usePagination'

const userStore = useUserStore()

/* 记录列表 */
const loading = ref(false)
const items = ref<CheckinRecord[]>([])
const total = ref(0)
const filter = ref<{ groupId: number | null; userId: number | null; date: string | null }>({
  groupId: null,
  userId: null,
  date: null,
})

const headers = [
  { title: '群聊', key: 'groupId', sortable: false },
  { title: '用户', key: 'userId', sortable: false },
  { title: '签到日期', key: 'checkinDate', sortable: false },
  { title: '签到时间', key: 'checkinAt', sortable: false },
]

async function fetchRecords(p: number, size: number) {
  loading.value = true
  try {
    const result = await checkinApi.listRecords({
      groupId: filter.value.groupId ?? undefined,
      userId: filter.value.userId ?? undefined,
      date: filter.value.date ?? undefined,
      page: p,
      pageSize: size,
    })
    items.value = result.items
    total.value = result.total
    // 预取本页所有 ID，减少名称解析闪烁
    const userIds = [...new Set(result.items.map((r) => r.userId))]
    const groupIds = [...new Set(result.items.map((r) => r.groupId))]
    userStore.prefetchIds(userIds, groupIds)
  } finally {
    loading.value = false
  }
}

const { page, pageSize, loadPage, onPageSizeChange } = usePagination(fetchRecords)

/* 用户信息弹窗 */
const userInfoDialog = ref(false)
const userInfoQq = ref<number | null>(null)
const userInfoGroupId = ref<number | null>(null)

function openUserInfo(qq: number, groupId: number) {
  userInfoQq.value = qq
  userInfoGroupId.value = groupId
  userInfoDialog.value = true
}

/* 群聊信息弹窗 */
const groupInfoDialog = ref(false)
const groupInfoId = ref<number | null>(null)

function openGroupInfo(groupId: number) {
  groupInfoId.value = groupId
  groupInfoDialog.value = true
}

onMounted(() => {
  loadPage(1)
})
</script>
