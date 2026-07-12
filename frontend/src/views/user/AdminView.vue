<template>
  <PageLayout>
    <template #actions>
      <v-btn color="red" variant="elevated" prepend-icon="mdi-shield-sync" @click="openSetDialog">
        设置御者
      </v-btn>
    </template>

    <!-- 骨架屏 -->
    <v-card v-if="store.adminsLoading || adminDetailLoading" flat>
      <div class="d-flex flex-no-wrap align-center pa-6">
        <v-skeleton-loader type="avatar" width="96" height="96" class="me-6" />
        <div style="flex: 1">
          <v-skeleton-loader type="text" width="60%" class="mb-2" />
          <v-skeleton-loader type="text" width="35%" class="mb-1" />
          <v-skeleton-loader type="text" width="55%" class="mb-1" />
          <v-skeleton-loader type="text" width="45%" />
        </div>
      </div>
    </v-card>

    <!-- 空状态 -->
    <v-card v-else-if="currentAdmin === null" flat>
      <div class="d-flex flex-column align-center justify-center py-16 text-medium-emphasis">
        <v-icon icon="mdi-shield-off-outline" size="48" class="mb-4" />
        <div class="text-body-1">暂未设置御者</div>
        <div class="text-body-2 mt-1">点击右上角「设置御者」来指定</div>
      </div>
    </v-card>

    <!-- 御者信息卡片 -->
    <v-card v-else flat>
      <div class="d-flex flex-no-wrap align-center">
        <v-avatar size="96" class="ma-6">
          <v-img :src="`https://q1.qlogo.cn/g?b=qq&nk=${currentAdmin.qq}&s=160`">
            <template #error>
              <v-icon size="48">mdi-account-circle</v-icon>
            </template>
          </v-img>
        </v-avatar>
        <div>
          <v-card-title class="text-h5 font-weight-bold">
            {{ currentAdmin.nickname || '未知用户' }}
          </v-card-title>
          <v-card-subtitle>QQ: {{ currentAdmin.qq }}</v-card-subtitle>
          <div class="px-4 pb-3 text-body-2 text-medium-emphasis">
            所属群数: {{ adminDetail?.groupCount ?? '-' }}
            <span class="mx-1">·</span>
            最后同步: {{ adminDetail?.lastSynced ? formatTime(adminDetail.lastSynced) : '-' }}
          </div>
        </div>
      </div>
    </v-card>

    <!-- 设置御者对话框 -->
    <v-dialog v-model="setDialog" max-width="480">
      <v-card>
        <v-card-title>设置御者</v-card-title>
        <v-card-text>
          <v-alert
            v-if="candidateError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            {{ candidateError }}
          </v-alert>
          <v-autocomplete
            v-model="selectedQQ"
            :items="store.adminCandidates"
            :loading="store.adminCandidatesLoading"
            item-value="qq"
            :item-title="
              (item: AdminCandidate) =>
                `${item.nickname}${item.remark ? '（' + item.remark + '）' : ''} · ${item.qq}`
            "
            label="从 master 账号好友列表中选择"
            variant="solo-filled"
            hide-details="auto"
            clearable
          />
          <v-alert type="warning" variant="tonal" density="compact" class="mt-4">
            御者将绕过所有功能级权限检查，拥有系统的完全控制权，请谨慎选择。
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="elevated" @click="setDialog = false">取消</v-btn>
          <v-btn
            color="red"
            variant="elevated"
            :loading="setLoading"
            :disabled="!selectedQQ"
            @click="doSet"
          >
            确认设置
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackColor" :timeout="3000" location="top right">
      {{ snackText }}
    </v-snackbar>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import type { AdminCandidate, UserDetail, GroupItem } from '@/apis/user'
import { formatTime } from '@/utils/format'
import PageLayout from '@/layouts/PageLayout.vue'

const store = useUserStore()

const currentAdmin = computed(() => store.admins[0] ?? null)

const adminDetail = ref<UserDetail | null>(null)
const adminGroups = ref<GroupItem[]>([])
const adminDetailLoading = ref(false)

async function loadAdminDetail() {
  const admin = currentAdmin.value
  if (!admin) {
    adminDetail.value = null
    adminGroups.value = []
    return
  }
  adminDetailLoading.value = true
  try {
    const result = await store.fetchUserDetail(admin.qq)
    adminDetail.value = result.user
    adminGroups.value = result.groups
  } catch {
    adminDetail.value = null
    adminGroups.value = []
  } finally {
    adminDetailLoading.value = false
  }
}

watch(currentAdmin, () => {
  void loadAdminDetail()
})

onMounted(async () => {
  await store.loadAdmins()
  await loadAdminDetail()
})

// 设置御者
const setDialog = ref(false)
const selectedQQ = ref<string | null>(null)
const setLoading = ref(false)
const candidateError = ref('')

async function openSetDialog() {
  candidateError.value = ''
  selectedQQ.value = null
  setDialog.value = true
  try {
    await store.loadAdminCandidates()
  } catch (e: unknown) {
    const err = e as { message?: string }
    candidateError.value = err?.message || '获取好友列表失败，请先确保 master 账号在线'
  }
}

async function doSet() {
  if (selectedQQ.value === null) return
  setLoading.value = true
  try {
    await store.setAdmin(selectedQQ.value)
    setDialog.value = false
    showSnack(`已将 ${selectedQQ.value} 设为御者`)
  } catch (e: unknown) {
    const err = e as { message?: string }
    showSnack(err?.message || '操作失败', 'error')
  } finally {
    setLoading.value = false
  }
}

// 提示
const snackbar = ref(false)
const snackText = ref('')
const snackColor = ref('success')

function showSnack(text: string, color = 'success') {
  snackText.value = text
  snackColor.value = color
  snackbar.value = true
}
</script>
