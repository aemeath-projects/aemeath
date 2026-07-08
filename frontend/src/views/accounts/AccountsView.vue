<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { VForm } from 'vuetify/components'
import PageLayout from '@/layouts/PageLayout.vue'
import AccountCard from './AccountCard.vue'
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountStatus,
  connectAccount,
  disconnectAccount,
  getRoutingTable,
  type Account,
  type AccountStatus,
  type CreateAccountDto,
  type UpdateAccountDto,
  type RoutingTableEntry,
} from '@/apis/accounts'

const accounts = ref<Account[]>([])
const sortedAccounts = computed(() =>
  [...accounts.value].sort((a, b) => (a.role === 'master' ? -1 : b.role === 'master' ? 1 : 0)),
)
const statuses = ref<Record<number, AccountStatus>>({})
const routingTable = ref<RoutingTableEntry[]>([])
const loadingAccountId = ref<number | null>(null)
const loading = ref(false)

/* 对话框状态 */
const createDialog = ref(false)
const editDialog = ref(false)
const deleteDialog = ref(false)
const routingDialog = ref(false)
const editTarget = ref<Account | null>(null)
const deleteTargetId = ref<number | null>(null)

/* 表单 Ref */
const createFormRef = ref<VForm | null>(null)

/* 表单 */
const form = ref<CreateAccountDto>({
  qq: '',
  role: 'normal',
  transport: 'ws',
  endpoint: '',
  isEnabled: true,
})

/* 验证规则 */
const requiredRule = (v: unknown) => (v != null && String(v).trim() !== '' ? true : '必填')

const roleOptions = ['master', 'normal', 'readonly']
const transportOptions = ['ws', 'sse']

async function load() {
  loading.value = true
  try {
    accounts.value = await listAccounts()
    routingTable.value = await getRoutingTable()
    const entries = await Promise.allSettled(
      accounts.value.map((a) => getAccountStatus(a.id).then((s) => [a.id, s] as const)),
    )
    entries.forEach((r) => {
      if (r.status === 'fulfilled') {
        const [id, status] = r.value
        statuses.value[id] = status
      }
    })
  } finally {
    loading.value = false
  }
}

async function onConnect(id: number) {
  loadingAccountId.value = id
  try {
    await connectAccount(id)
    statuses.value[id] = await getAccountStatus(id)
  } finally {
    loadingAccountId.value = null
  }
}

async function onDisconnect(id: number) {
  loadingAccountId.value = id
  try {
    await disconnectAccount(id)
    statuses.value[id] = await getAccountStatus(id)
  } finally {
    loadingAccountId.value = null
  }
}

function onEdit(account: Account) {
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
      <v-btn color="primary" prepend-icon="mdi-routes" @click="routingDialog = true">
        路由表
      </v-btn>
    </template>

    <!-- 账号卡片网格 -->
    <v-skeleton-loader v-if="loading && !accounts.length" type="card" class="mb-4" />
    <v-row v-else>
      <v-col v-for="account in sortedAccounts" :key="account.id" cols="12" sm="6" md="4">
        <AccountCard
          :account="account"
          :status="statuses[account.id]"
          :loading="loadingAccountId === account.id"
          @connect="onConnect"
          @disconnect="onDisconnect"
          @edit="onEdit"
          @delete="onDeleteConfirm"
        />
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <v-card
          elevation="1"
          class="add-account-card cursor-pointer h-100 d-flex align-center"
          @click="onCreateOpen"
        >
          <div class="text-center w-100">
            <v-icon size="48" color="medium-emphasis" class="mb-2">mdi-plus</v-icon>
            <div class="text-body-2 text-medium-emphasis">新增账户</div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- 路由表 Dialog -->
    <v-dialog v-model="routingDialog" max-width="640">
      <v-card title="路由表">
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Client ID</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in routingTable" :key="entry.clientId">
                <td class="text-caption">{{ entry.clientId }}</td>
                <td>
                  <v-chip
                    :color="entry.state === 'connected' ? 'success' : 'error'"
                    size="x-small"
                    label
                  >
                    {{ entry.state }}
                  </v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="routingDialog = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 新增账户 Dialog -->
    <v-dialog v-model="createDialog" max-width="480">
      <v-card title="新增账户">
        <v-card-text>
          <v-form ref="createFormRef">
            <v-text-field v-model="form.qq" label="QQ 号" :rules="[requiredRule]" />
            <v-text-field v-model="form.nickname" label="昵称（可选）" />
            <v-select
              v-model="form.role"
              :items="roleOptions"
              label="角色"
              :rules="[requiredRule]"
            />
            <v-select
              v-model="form.transport"
              :items="transportOptions"
              label="传输协议"
              :rules="[requiredRule]"
            />
            <v-text-field v-model="form.endpoint" label="Endpoint 地址" :rules="[requiredRule]" />
            <v-text-field v-model="form.token" label="Token（可选）" />
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

    <!-- 编辑账户 Dialog -->
    <v-dialog v-model="editDialog" max-width="480">
      <v-card title="编辑账户">
        <v-card-text>
          <v-text-field v-model="form.nickname" label="昵称" />
          <v-select v-model="form.transport" :items="transportOptions" label="传输协议" />
          <v-text-field v-model="form.endpoint" label="Endpoint 地址" />
          <v-text-field v-model="form.token" label="Token" />
          <v-switch v-model="form.isEnabled" label="启用" />
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
  </PageLayout>
</template>

<style scoped>
.add-account-card {
  transition: background-color 0.2s;
}
.add-account-card:hover {
  background-color: rgba(var(--v-border-color), 0.06);
}
</style>
