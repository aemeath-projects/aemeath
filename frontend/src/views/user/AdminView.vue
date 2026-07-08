<template>
  <PageLayout>
    <template #actions>
      <v-btn color="red" variant="elevated" prepend-icon="mdi-shield-sync" @click="openSetDialog">
        设置御者
      </v-btn>
    </template>

    <v-card flat>
      <div v-if="store.adminsLoading || adminDetailLoading" class="pa-4">
        <v-skeleton-loader type="list-item-avatar-three-line, divider, article" />
      </div>

      <template v-else>
        <div
          v-if="currentAdmin === null"
          class="d-flex flex-column align-center justify-center py-16 text-medium-emphasis"
        >
          <v-icon icon="mdi-shield-off-outline" size="48" class="mb-4" />
          <div class="text-body-1">暂未设置御者</div>
          <div class="text-body-2 mt-1">点击右上角「设置御者」来指定</div>
        </div>

        <div v-else class="pa-4">
          <div class="d-flex align-center ga-6">
            <v-avatar size="112" rounded="lg">
              <v-img :src="`https://q1.qlogo.cn/g?b=qq&nk=${currentAdmin.qq}&s=160`">
                <template #error>
                  <v-icon size="64">mdi-account-circle</v-icon>
                </template>
              </v-img>
            </v-avatar>

            <v-divider vertical length="88" />

            <div class="d-flex flex-column justify-center ga-1">
              <div class="text-h5 font-weight-bold">
                {{ currentAdmin.nickname || '未知用户' }}
              </div>
              <div class="text-body-2 text-medium-emphasis">QQ: {{ currentAdmin.qq }}</div>
              <div class="text-body-2 text-medium-emphasis">
                所属群数: {{ adminDetail?.groupCount ?? '-' }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                最后同步: {{ adminDetail?.lastSynced ? formatTime(adminDetail.lastSynced) : '-' }}
              </div>
            </div>
          </div>
        </div>
      </template>

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

      <v-snackbar v-model="snackbar" :color="snackColor" :timeout="3000" location="bottom">
        {{ snackText }}
      </v-snackbar>
    </v-card>
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
const selectedQQ = ref<number | null>(null)
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
