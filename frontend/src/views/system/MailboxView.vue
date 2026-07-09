<template>
  <PageLayout>
    <template #actions>
      <v-select
        v-model="filter.isRead"
        :items="[
          { title: '全部', value: undefined },
          { title: '未读', value: false },
          { title: '已读', value: true },
        ]"
        label="筛选"
        density="compact"
        variant="solo-filled"
        hide-details
        style="max-width: 120px"
        @update:model-value="loadPage(1)"
      />
      <v-btn
        v-if="selected.length > 0"
        variant="tonal"
        color="primary"
        size="small"
        :loading="batchLoading"
        @click="batchMarkRead"
      >
        批量标记已读 ({{ selected.length }})
      </v-btn>
      <v-btn
        v-if="hasUnread"
        variant="tonal"
        color="warning"
        size="small"
        :loading="batchLoading"
        @click="markAllRead"
      >
        一键全部已读
      </v-btn>
    </template>

    <v-card flat>
      <v-skeleton-loader v-if="loading && !items.length" type="table" class="pa-2" />
      <v-data-table
        v-else
        v-model="selected"
        :headers="headers"
        :items="items"
        :items-length="total"
        :loading="loading"
        :page="page"
        :items-per-page="pageSize"
        :items-per-page-options="[10, 20, 50]"
        show-select
        hover
        return-object
        @update:page="loadPage"
        @update:items-per-page="onPageSizeChange"
      >
        <template #[`item.title`]="{ item }">
          <span :class="{ 'font-weight-bold': !item.isRead }">{{ item.title }}</span>
        </template>

        <template #[`item.isRead`]="{ item }">
          <v-chip :color="item.isRead ? 'success' : 'warning'" size="small" variant="tonal">
            {{ item.isRead ? '已读' : '未读' }}
          </v-chip>
        </template>

        <template #[`item.createdAt`]="{ item }">
          <span class="text-caption text-medium-emphasis">{{ formatTime(item.createdAt) }}</span>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" color="primary" @click="openDetail(item)">
            查看
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="detailDialog" max-width="640">
      <v-card>
        <v-card-title>{{ detailItem?.title }}</v-card-title>
        <v-card-subtitle v-if="detailItem">
          {{ formatTime(detailItem.createdAt) }}
          <v-chip
            :color="detailItem.isRead ? 'success' : 'warning'"
            size="x-small"
            variant="tonal"
            class="ml-2"
          >
            {{ detailItem.isRead ? '已读' : '未读' }}
          </v-chip>
        </v-card-subtitle>
        <v-card-text>
          <pre class="mailbox-content">{{ detailItem?.content }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="detailDialog = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
      {{ snackbar.text }}
    </v-snackbar>
  </PageLayout>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import * as mailboxApi from '@/apis/mailbox'
import type { MailboxItem } from '@/apis/mailbox'
import PageLayout from '@/layouts/PageLayout.vue'
import { formatTime } from '@/utils/format'
import { usePagination } from '@/composables/usePagination'
import { useMailboxStore } from '@/stores/mailbox'

const mailboxStore = useMailboxStore()

const loading = ref(false)
const items = ref<MailboxItem[]>([])
const total = ref(0)
const selected = ref<MailboxItem[]>([])
const batchLoading = ref(false)

const filter = ref<{ isRead: boolean | undefined }>({ isRead: undefined })

const detailDialog = ref(false)
const detailItem = ref<MailboxItem | null>(null)

const snackbar = ref({ show: false, text: '', color: 'success' })

const headers = [
  { title: '标题', key: 'title', sortable: false },
  { title: '状态', key: 'isRead', sortable: false, width: 80 },
  { title: '时间', key: 'createdAt', sortable: false, width: 180 },
  { title: '操作', key: 'actions', sortable: false, width: 80 },
]

const hasUnread = computed(() => items.value.some((item) => !item.isRead))

async function fetchList(p: number, size: number) {
  loading.value = true
  try {
    const result = await mailboxApi.fetchMailboxList({
      page: p,
      pageSize: size,
      isRead: filter.value.isRead,
    })
    items.value = result.items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

const { page, pageSize, loadPage, onPageSizeChange } = usePagination(fetchList)

watch(
  () => mailboxStore.latestMessage,
  (msg) => {
    if (!msg) return
    if (page.value !== 1) return
    if (filter.value.isRead === true) return // "已读" 筛选下，新条目（必为未读）不展示
    items.value = [msg, ...items.value].slice(0, pageSize.value)
    total.value += 1
  },
)

async function markAsReadSingle(id: string) {
  try {
    await mailboxApi.markAsRead(id)
    mailboxStore.decrementUnread()
    const item = items.value.find((i) => i.id === id)
    if (item) {
      item.isRead = true
      item.readAt = new Date().toISOString()
    }
  } catch {
    // 忽略单条失败
  }
}

async function openDetail(item: MailboxItem) {
  detailItem.value = item
  detailDialog.value = true
  if (!item.isRead) {
    await markAsReadSingle(item.id)
  }
}

async function batchMarkRead() {
  batchLoading.value = true
  let failed = 0
  try {
    const unread = selected.value.filter((i) => !i.isRead)
    const results = await Promise.allSettled(unread.map((i) => markAsReadSingle(i.id)))
    failed = results.filter((r) => r.status === 'rejected').length
    selected.value = []
    await loadPage(page.value)
  } finally {
    batchLoading.value = false
  }
  if (failed > 0) {
    snackbar.value = { show: true, text: `${failed} 条标记失败`, color: 'warning' }
  } else {
    snackbar.value = { show: true, text: '批量标记已读完成', color: 'success' }
  }
}

async function markAllRead() {
  batchLoading.value = true
  let failed = 0
  try {
    const unreadIds = items.value.filter((i) => !i.isRead).map((i) => i.id)
    const results = await Promise.allSettled(unreadIds.map((id) => markAsReadSingle(id)))
    failed = results.filter((r) => r.status === 'rejected').length
    await loadPage(page.value)
  } finally {
    batchLoading.value = false
  }
  if (failed > 0) {
    snackbar.value = { show: true, text: `${failed} 条标记失败`, color: 'warning' }
  } else {
    snackbar.value = { show: true, text: '全部标记已读完成', color: 'success' }
  }
}

onMounted(() => {
  loadPage(1)
})
</script>

<style scoped>
.mailbox-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
}
</style>
