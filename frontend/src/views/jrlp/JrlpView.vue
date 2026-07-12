<template>
  <PageLayout>
    <template #actions>
      <v-btn
        color="primary"
        variant="elevated"
        prepend-icon="mdi-pencil"
        @click="openSetWifeDialog"
      >
        手动设置老婆
      </v-btn>
    </template>

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

        <!-- 抽取者列 -->
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

        <!-- 老婆列 -->
        <template #[`item.wifeQq`]="{ item }">
          <div
            class="d-flex align-center ga-2 cursor-pointer"
            @click="openUserInfo(item.wifeQq, item.groupId)"
          >
            <v-avatar size="24">
              <v-img :src="`https://q1.qlogo.cn/g?b=qq&nk=${item.wifeQq}&s=40`">
                <template #error>
                  <v-icon size="20">mdi-account-circle</v-icon>
                </template>
              </v-img>
            </v-avatar>
            <span class="text-caption"
              >{{ userStore.getUserName(item.wifeQq) }}（{{ item.wifeQq }}）</span
            >
          </div>
        </template>

        <!-- 抽取时间列 -->
        <template #[`item.drawnAt`]="{ item }">
          <v-chip :color="item.drawnAt ? 'success' : 'warning'" size="small" variant="tonal">
            {{ item.drawnAt ? formatTime(item.drawnAt) : '预设中' }}
          </v-chip>
        </template>

        <!-- 操作列 -->
        <template #[`item.actions`]="{ item }">
          <v-btn icon size="small" variant="text" @click="openEditDialog(item)">
            <v-icon>mdi-pencil</v-icon>
            <v-tooltip activator="parent" location="top">修改老婆</v-tooltip>
          </v-btn>
          <v-btn icon size="small" variant="text" color="error" @click="confirmDelete(item)">
            <v-icon>mdi-delete</v-icon>
            <v-tooltip activator="parent" location="top">删除记录</v-tooltip>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- 手动设置老婆弹窗 -->
    <v-dialog v-model="setWifeDialog" max-width="480">
      <v-card>
        <v-card-title>手动设置老婆</v-card-title>
        <v-card-text>
          <v-form ref="setWifeFormRef">
            <GroupAutocomplete
              v-model="setWifeData.groupId"
              label="群号"
              :hide-details="false"
              :rules="[required]"
              class="mb-2"
            />
            <UserAutocomplete
              v-model="setWifeData.userId"
              label="抽取者 QQ"
              :hide-details="false"
              :rules="[required]"
              class="mb-2"
            />
            <UserAutocomplete
              v-model="setWifeData.wifeQq"
              label="老婆 QQ"
              :hide-details="false"
              :rules="[required]"
              class="mb-2"
            />
            <v-text-field v-model="setWifeData.date" label="日期" type="date" :rules="[required]" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="setWifeDialog = false">取消</v-btn>
          <v-btn color="primary" :loading="setWifeLoading" @click="submitSetWife">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 编辑老婆弹窗 -->
    <v-dialog v-model="editDialog" max-width="400">
      <v-card>
        <v-card-title>修改老婆</v-card-title>
        <v-card-text>
          <v-form ref="editFormRef">
            <UserAutocomplete
              v-model="editData.wifeQq"
              label="新老婆 QQ"
              :hide-details="false"
              :rules="[required]"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">取消</v-btn>
          <v-btn color="primary" :loading="editLoading" @click="submitEdit">确定</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 删除确认弹窗 -->
    <v-dialog v-model="deleteDialog" max-width="360">
      <v-card>
        <v-card-title>确认删除</v-card-title>
        <v-card-text>
          确定删除用户 {{ deleteTarget?.userId }} 在群 {{ deleteTarget?.groupId }}
          {{ deleteTarget?.date }} 的老婆记录吗？
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">取消</v-btn>
          <v-btn color="error" :loading="deleteLoading" @click="doDelete">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 用户信息弹窗 -->
    <UserInfoCard v-model="userInfoDialog" :qq="userInfoQq" :group-id="userInfoGroupId" />

    <!-- 群聊信息弹窗 -->
    <GroupInfoCard v-model="groupInfoDialog" :group-id="groupInfoId" @open-user="openUserInfo" />
  </PageLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import * as jrlpApi from '@/apis/jrlp'
import type { WifeRecord } from '@/apis/jrlp'
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
const items = ref<WifeRecord[]>([])
const total = ref(0)
const filter = ref<{ groupId: string | null; userId: string | null; date: string | null }>({
  groupId: null,
  userId: null,
  date: null,
})

const headers = [
  { title: '群聊', key: 'groupId', sortable: false },
  { title: '抽取者', key: 'userId', sortable: false },
  { title: '老婆', key: 'wifeQq', sortable: false },
  { title: '日期', key: 'date', sortable: false },
  { title: '状态', key: 'drawnAt', sortable: false },
  { title: '操作', key: 'actions', sortable: false },
]

async function fetchRecords(p: number, size: number) {
  loading.value = true
  try {
    const result = await jrlpApi.listRecords({
      groupId: filter.value.groupId ?? undefined,
      userId: filter.value.userId ?? undefined,
      date: filter.value.date ?? undefined,
      page: p,
      pageSize: size,
    })
    items.value = result.items
    total.value = result.total
    // 预取本页所有 ID，减少名称解析闪烁
    const userIds = [...new Set(result.items.flatMap((r) => [r.userId, r.wifeQq]))]
    const groupIds = [...new Set(result.items.map((r) => r.groupId))]
    userStore.prefetchIds(userIds, groupIds)
  } finally {
    loading.value = false
  }
}

const { page, pageSize, loadPage, refreshPage, onPageSizeChange } = usePagination(fetchRecords)

/* 公共表单校验 */
const required = (v: unknown) => !!v || '此字段为必填'

/* 手动设置老婆 */
const setWifeDialog = ref(false)
const setWifeLoading = ref(false)
const setWifeFormRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const setWifeData = ref({
  groupId: null as string | null,
  userId: null as string | null,
  wifeQq: null as string | null,
  date: '',
})

function openSetWifeDialog() {
  setWifeData.value = { groupId: null, userId: null, wifeQq: null, date: '' }
  setWifeDialog.value = true
}

async function submitSetWife() {
  const valid = await setWifeFormRef.value?.validate()
  if (!valid?.valid) return
  setWifeLoading.value = true
  try {
    await jrlpApi.setWife({
      groupId: setWifeData.value.groupId!,
      userId: setWifeData.value.userId!,
      wifeQq: setWifeData.value.wifeQq!,
      date: setWifeData.value.date,
    })
    setWifeDialog.value = false
    await loadPage(1)
  } finally {
    setWifeLoading.value = false
  }
}

/* 编辑老婆 */
const editDialog = ref(false)
const editLoading = ref(false)
const editingId = ref<string | null>(null)
const editFormRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const editData = ref({ wifeQq: null as string | null })

function openEditDialog(item: WifeRecord) {
  editingId.value = item.id
  editData.value = { wifeQq: item.wifeQq }
  editDialog.value = true
}

async function submitEdit() {
  const valid = await editFormRef.value?.validate()
  if (!valid?.valid) return
  if (editingId.value == null) return
  editLoading.value = true
  try {
    await jrlpApi.updateRecord({ id: editingId.value, wifeQq: editData.value.wifeQq! })
    editDialog.value = false
    await refreshPage()
  } finally {
    editLoading.value = false
  }
}

/* 删除 */
const deleteDialog = ref(false)
const deleteLoading = ref(false)
const deleteTarget = ref<WifeRecord | null>(null)

function confirmDelete(item: WifeRecord) {
  deleteTarget.value = item
  deleteDialog.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    await jrlpApi.deleteRecord({ id: deleteTarget.value.id })
    deleteDialog.value = false
    await refreshPage()
  } finally {
    deleteLoading.value = false
  }
}

/* 用户信息弹窗 */
const userInfoDialog = ref(false)
const userInfoQq = ref<string | null>(null)
const userInfoGroupId = ref<string | null>(null)

function openUserInfo(qq: string, groupId: string) {
  userInfoQq.value = qq
  userInfoGroupId.value = groupId
  userInfoDialog.value = true
}

/* 群聊信息弹窗 */
const groupInfoDialog = ref(false)
const groupInfoId = ref<string | null>(null)

function openGroupInfo(groupId: string) {
  groupInfoId.value = groupId
  groupInfoDialog.value = true
}

onMounted(() => {
  loadPage(1)
})
</script>
