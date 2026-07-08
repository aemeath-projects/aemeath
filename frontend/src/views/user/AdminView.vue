<template>
  <PageLayout>
    <template #actions>
      <v-btn color="red" variant="elevated" prepend-icon="mdi-shield-sync" @click="openSetDialog">
        {{ currentAdmin === null ? '设置御者' : '更换御者' }}
      </v-btn>
    </template>

    <v-card flat>
      <div v-if="store.adminsLoading" class="d-flex flex-wrap ga-4 pa-4">
        <v-skeleton-loader type="list-item-avatar" width="280" elevation="3" rounded="lg" />
      </div>

      <template v-else>
        <div class="d-flex flex-wrap ga-4 pa-4">
          <div
            v-if="currentAdmin === null"
            class="d-flex flex-column align-center justify-center py-16 text-medium-emphasis"
            style="width: 100%"
          >
            <v-icon icon="mdi-shield-off-outline" size="48" class="mb-4" />
            <div class="text-body-1">暂未设置御者</div>
            <div class="text-body-2 mt-1">点击右上角「设置御者」来指定</div>
          </div>

          <v-card v-else elevation="3" rounded="lg" width="280" class="admin-card">
            <div class="d-flex align-center pa-4">
              <v-avatar
                size="48"
                class="mr-4 cursor-pointer"
                @click="openAdminDetail(currentAdmin.qq)"
              >
                <v-img :src="`https://q1.qlogo.cn/g?b=qq&nk=${currentAdmin.qq}&s=100`" />
              </v-avatar>
              <div
                class="flex-grow-1 overflow-hidden cursor-pointer"
                @click="openAdminDetail(currentAdmin.qq)"
              >
                <div class="text-subtitle-1 font-weight-bold text-truncate">
                  {{ currentAdmin.nickname || '未知用户' }}
                </div>
                <div class="text-caption text-medium-emphasis">{{ currentAdmin.qq }}</div>
              </div>
            </div>
          </v-card>
        </div>

        <div v-if="currentAdmin !== null" class="d-flex ga-2 pa-4 pt-0">
          <v-btn
            color="error"
            variant="elevated"
            prepend-icon="mdi-shield-off"
            @click="removeDialog = true"
          >
            移除御者
          </v-btn>
        </div>
      </template>

      <!-- 设置/更换御者对话框 -->
      <v-dialog v-model="setDialog" max-width="480">
        <v-card>
          <v-card-title>{{ currentAdmin === null ? '设置御者' : '更换御者' }}</v-card-title>
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

      <!-- 移除确认对话框 -->
      <v-dialog v-model="removeDialog" max-width="400">
        <v-card>
          <v-card-title>确认移除御者</v-card-title>
          <v-card-text>
            确定要移除当前御者
            <strong>{{ currentAdmin?.nickname || currentAdmin?.qq }}</strong> 的权限吗？
            移除后，系统将根据其当前状态自动降级为好友、群友或陌生人。
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="elevated" @click="removeDialog = false">取消</v-btn>
            <v-btn color="error" variant="elevated" :loading="removeLoading" @click="doRemove">
              确认移除
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- 提示 snackbar -->
      <v-snackbar v-model="snackbar" :color="snackColor" :timeout="3000" location="bottom">
        {{ snackText }}
      </v-snackbar>
    </v-card>

    <!-- 御者用户详情弹窗 -->
    <UserInfoCard v-model="adminDetailDialog" :qq="adminDetailQQ" />
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import type { AdminCandidate } from '@/apis/user'
import PageLayout from '@/layouts/PageLayout.vue'
import UserInfoCard from '@/components/UserInfoCard.vue'

const store = useUserStore()

const currentAdmin = computed(() => store.admins[0] ?? null)

// 设置/更换御者
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

// 移除御者
const removeDialog = ref(false)
const removeLoading = ref(false)

async function doRemove() {
  removeLoading.value = true
  try {
    await store.unsetAdmin()
    removeDialog.value = false
    showSnack('已移除御者权限')
  } catch (e: unknown) {
    const err = e as { message?: string }
    showSnack(err?.message || '操作失败', 'error')
  } finally {
    removeLoading.value = false
  }
}

// 御者详情弹窗
const adminDetailDialog = ref(false)
const adminDetailQQ = ref<number | null>(null)

function openAdminDetail(qq: number) {
  adminDetailQQ.value = qq
  adminDetailDialog.value = true
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

onMounted(() => store.loadAdmins())
</script>
