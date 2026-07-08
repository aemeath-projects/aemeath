<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { VForm } from 'vuetify/components'
import PageLayout from '@/layouts/PageLayout.vue'
import { requiredRule, endpointRule, qqRule } from '@/utils/validators'
import AccountCard from '@/components/accounts/AccountCard.vue'
import {
  listAccountsWithStatus,
  createAccount,
  updateAccount,
  deleteAccount,
  getPriorityMode,
  setPriorityMode,
  type AccountWithStatus,
  type CreateAccountDto,
  type UpdateAccountDto,
  type PriorityMode,
} from '@/apis/accounts'

const accounts = ref<AccountWithStatus[]>([])
const sortedAccounts = computed(() =>
  [...accounts.value].sort((a, b) => (a.role === 'master' ? -1 : b.role === 'master' ? 1 : 0)),
)
const togglingAccountId = ref<number | null>(null)
const loading = ref(false)

/* 对话框状态 */
const createDialog = ref(false)
const editDialog = ref(false)
const deleteDialog = ref(false)
const editTarget = ref<AccountWithStatus | null>(null)
const deleteTargetId = ref<number | null>(null)

/* 表单 Ref */
const createFormRef = ref<VForm | null>(null)
const editFormRef = ref<VForm | null>(null)

/* 表单 */
const form = ref<CreateAccountDto>({
  qq: '',
  role: 'normal',
  transport: 'ws',
  endpoint: '',
  isEnabled: true,
})

const roleOptions = [
  { title: '主账号', value: 'master' },
  { title: '普通', value: 'normal' },
  { title: '只读', value: 'readonly' },
]
const transportOptions = [
  { title: 'WebSocket', value: 'ws' },
  { title: 'HTTP SSE', value: 'sse' },
]

/* 路由优先级模式 Dialog */
const priorityModeDialog = ref(false)
const priorityMode = ref<PriorityMode>('prefer_master')
const priorityModeSaving = ref(false)
const priorityModeOptions = [
  { title: '优先主账号（prefer_master）', value: 'prefer_master' },
  { title: '优先普通账号（prefer_normal）', value: 'prefer_normal' },
]

async function openPriorityModeDialog() {
  priorityModeDialog.value = true
  const { mode } = await getPriorityMode()
  priorityMode.value = mode
}

async function onSavePriorityMode() {
  priorityModeSaving.value = true
  try {
    await setPriorityMode(priorityMode.value)
    priorityModeDialog.value = false
  } finally {
    priorityModeSaving.value = false
  }
}

async function load() {
  loading.value = true
  try {
    accounts.value = await listAccountsWithStatus()
  } finally {
    loading.value = false
  }
}

async function onToggleEnabled(id: number, value: boolean) {
  togglingAccountId.value = id
  try {
    await updateAccount(id, { isEnabled: value })
    await load()
  } finally {
    togglingAccountId.value = null
  }
}

function onEdit(account: AccountWithStatus) {
  editTarget.value = account
  form.value = {
    qq: account.qq,
    role: account.role,
    transport: account.transport,
    endpoint: account.endpoint,
    nickname: account.nickname ?? undefined,
    token: account.token ?? undefined,
    isEnabled: account.isEnabled,
  } as CreateAccountDto
  editDialog.value = true
}

async function onSaveEdit() {
  if (!editTarget.value) return
  const { valid } = (await editFormRef.value?.validate()) ?? { valid: false }
  if (!valid) return
  const { qq: _qq, role: _role, ...updateFields } = form.value
  await updateAccount(editTarget.value.id, updateFields as UpdateAccountDto)
  editDialog.value = false
  await load()
}

async function onSaveCreate() {
  const { valid } = (await createFormRef.value?.validate()) ?? { valid: false }
  if (!valid) return
  await createAccount(form.value)
  createDialog.value = false
  await load()
}

function onDeleteConfirm(id: number) {
  deleteTargetId.value = id
  deleteDialog.value = true
}

async function onDeleteExecute() {
  if (!deleteTargetId.value) return
  await deleteAccount(deleteTargetId.value)
  deleteDialog.value = false
  await load()
}

function resetForm() {
  form.value = { qq: '', role: 'normal', transport: 'ws', endpoint: '', isEnabled: true }
  createFormRef.value?.reset()
}

function onCreateOpen() {
  resetForm()
  createDialog.value = true
}

onMounted(load)
</script>

<template>
  <PageLayout>
    <template #actions>
      <v-btn variant="elevated" prepend-icon="mdi-swap-vertical" @click="openPriorityModeDialog">
        路由优先级
      </v-btn>
    </template>

    <!-- 账号卡片网格 -->
    <v-skeleton-loader v-if="loading && !accounts.length" type="card" class="mb-4" />
    <v-row v-else>
      <v-col v-for="account in sortedAccounts" :key="account.id" cols="12" sm="6" md="3">
        <AccountCard
          :account="account"
          :toggling="togglingAccountId === account.id"
          @toggle-enabled="onToggleEnabled"
          @edit="onEdit"
          @delete="onDeleteConfirm"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card
          elevation="1"
          class="add-account-card cursor-pointer h-100 d-flex align-center"
          @click="onCreateOpen"
        >
          <div class="text-center w-100">
            <v-icon size="48" color="medium-emphasis" class="mb-2">mdi-plus</v-icon>
            <div class="text-body-2 text-medium-emphasis">新增账号</div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- 新增账号 Dialog -->
    <v-dialog v-model="createDialog" max-width="480">
      <v-card title="新增账号">
        <v-card-text>
          <v-form ref="createFormRef">
            <v-text-field
              v-model="form.qq"
              label="QQ 号"
              placeholder="请输入 QQ 号"
              :rules="[requiredRule, qqRule]"
              variant="underlined"
            />
            <v-text-field
              v-model="form.nickname"
              label="昵称"
              placeholder="请输入昵称（可选）"
              variant="underlined"
            />
            <v-select
              v-model="form.role"
              :items="roleOptions"
              label="角色"
              placeholder="请选择角色"
              :rules="[requiredRule]"
              variant="underlined"
            />
            <v-select
              v-model="form.transport"
              :items="transportOptions"
              label="传输协议"
              placeholder="请选择传输协议"
              :rules="[requiredRule]"
              variant="underlined"
            />
            <v-text-field
              v-model="form.endpoint"
              label="Endpoint 地址"
              placeholder="请输入 Endpoint 地址"
              :rules="[requiredRule, endpointRule]"
              variant="underlined"
            />
            <v-text-field
              v-model="form.token"
              label="Token"
              placeholder="请输入 Token（可选）"
              variant="underlined"
            />
            <v-switch v-model="form.isEnabled" label="启用" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="createDialog = false">取消</v-btn>
          <v-btn color="primary" @click="onSaveCreate">创建</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 编辑账号 Dialog -->
    <v-dialog v-model="editDialog" max-width="480">
      <v-card title="编辑账号">
        <v-card-text>
          <v-form ref="editFormRef">
            <v-text-field
              v-model="form.nickname"
              label="昵称"
              placeholder="请输入昵称"
              variant="underlined"
            />
            <v-select
              v-model="form.transport"
              :items="transportOptions"
              label="传输协议"
              variant="underlined"
            />
            <v-text-field
              v-model="form.endpoint"
              label="Endpoint 地址"
              placeholder="请输入 Endpoint 地址"
              :rules="[requiredRule, endpointRule]"
              variant="underlined"
            />
            <v-text-field
              v-model="form.token"
              label="Token"
              placeholder="请输入 Token"
              variant="underlined"
            />
            <v-switch v-model="form.isEnabled" label="启用" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="editDialog = false">取消</v-btn>
          <v-btn color="primary" @click="onSaveEdit">保存</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 删除确认 Dialog -->
    <v-dialog v-model="deleteDialog" max-width="360">
      <v-card title="确认删除">
        <v-card-text>删除后不可恢复，确认删除该账号吗？</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="deleteDialog = false">取消</v-btn>
          <v-btn color="error" @click="onDeleteExecute">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 路由优先级 Dialog -->
    <v-dialog v-model="priorityModeDialog" max-width="420">
      <v-card title="路由优先级">
        <v-card-text>
          <v-radio-group v-model="priorityMode">
            <v-radio
              v-for="option in priorityModeOptions"
              :key="option.value"
              :label="option.title"
              :value="option.value"
            />
          </v-radio-group>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="priorityModeDialog = false">取消</v-btn>
          <v-btn color="primary" :loading="priorityModeSaving" @click="onSavePriorityMode">
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.add-account-card {
  min-height: 200px;
  transition: background-color 0.2s;
}
.add-account-card:hover {
  background-color: rgba(var(--v-border-color), 0.06);
}
</style>
