<template>
  <PageLayout>
    <template #actions>
      <v-select
        v-model="filterProvider"
        :items="providerOptions"
        label="提供商筛选"
        density="compact"
        variant="solo-filled"
        hide-details
        clearable
        style="max-width: 200px"
        @update:model-value="loadPage"
      />
      <v-btn color="red" prepend-icon="mdi-plus" class="ml-2" @click="openCreate"> 添加模型 </v-btn>
    </template>
    <v-card flat>
      <v-skeleton-loader
        v-if="store.modelsLoading && !store.models.length"
        type="table"
        class="pa-2"
      />
      <v-data-table
        v-else
        :headers="headers"
        :items="store.models"
        :loading="store.modelsLoading"
        hover
      >
        <!-- 模型名称列 -->
        <template #[`item.modelName`]="{ item }">
          <div>
            <span class="font-weight-medium">{{ item.modelName }}</span>
            <div v-if="item.displayName" class="text-caption text-medium-emphasis">
              {{ item.displayName }}
            </div>
          </div>
        </template>

        <!-- 价格列 -->
        <template #[`item.price`]="{ item }">
          <div class="text-caption">
            <div>入 &#xFFE5;{{ item.inputPrice.toFixed(2) }}/M</div>
            <div>出 &#xFFE5;{{ item.outputPrice.toFixed(2) }}/M</div>
          </div>
        </template>

        <!-- 温度列 -->
        <template #[`item.temperature`]="{ item }">
          <v-chip size="small" variant="elevated">{{ item.temperature.toFixed(1) }}</v-chip>
        </template>

        <!-- 流式列 -->
        <template #[`item.forceStream`]="{ item }">
          <v-icon :color="item.forceStream ? 'success' : 'grey'" size="small">
            {{ item.forceStream ? 'mdi-check-circle' : 'mdi-close-circle' }}
          </v-icon>
        </template>

        <!-- 操作列 -->
        <template #[`item.actions`]="{ item }">
          <v-btn icon size="small" variant="elevated" @click="openEdit(item)">
            <v-icon>mdi-pencil</v-icon>
            <v-tooltip activator="parent" location="top">编辑</v-tooltip>
          </v-btn>
          <v-btn icon size="small" variant="elevated" color="error" @click="confirmDelete(item)">
            <v-icon>mdi-delete</v-icon>
            <v-tooltip activator="parent" location="top">删除</v-tooltip>
          </v-btn>
        </template>
      </v-data-table>

      <!-- 创建/编辑对话框 -->
      <v-dialog :model-value="formDialog" max-width="600" @update:model-value="formDialog = $event">
        <v-card>
          <v-card-title>
            {{ isEditModel ? '编辑模型' : '添加模型' }}
          </v-card-title>

          <v-card-text>
            <v-form ref="modelFormRef" @submit.prevent="submitModelForm">
              <!-- 提供商选择（仅创建时） -->
              <v-select
                v-if="!isEditModel"
                v-model="modelForm.providerId"
                :items="providerOptions"
                label="所属提供商"
                :rules="[rules.required]"
                variant="solo-filled"
                density="compact"
                class="mb-3"
              />

              <v-text-field
                v-model="modelForm.modelName"
                label="模型标识"
                :rules="[rules.required]"
                :disabled="isEditModel"
                variant="solo-filled"
                density="compact"
                class="mb-3"
                placeholder="如 gpt-4o, deepseek-chat"
              />

              <v-text-field
                v-model="modelForm.displayName"
                label="展示名称 (可选)"
                variant="solo-filled"
                density="compact"
                class="mb-3"
                placeholder="如 GPT-4o"
              />

              <v-row dense class="mb-3">
                <v-col cols="6">
                  <v-text-field
                    v-model.number="modelForm.inputPrice"
                    label="输入价格 (&#xFFE5;/M tokens)"
                    variant="solo-filled"
                    density="compact"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    v-model.number="modelForm.outputPrice"
                    label="输出价格 (&#xFFE5;/M tokens)"
                    variant="solo-filled"
                    density="compact"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </v-col>
              </v-row>

              <!-- 温度滑块 -->
              <div class="text-body-2 mb-1">温度: {{ modelForm.temperature.toFixed(1) }}</div>
              <v-slider
                v-model="modelForm.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                color="red"
                thumb-label
                class="mb-3"
              />

              <v-text-field
                v-model.number="modelForm.maxTokens"
                label="最大输出 Token (可选)"
                variant="solo-filled"
                density="compact"
                class="mb-3"
                type="number"
                min="1"
                clearable
              />

              <v-switch
                v-model="modelForm.forceStream"
                label="强制流式输出"
                color="red"
                density="compact"
                hide-details
                class="mb-3"
              />

              <!-- 额外参数 JSON 编辑器 -->
              <v-textarea
                v-model="extraParamsStr"
                label="额外参数 (JSON)"
                variant="solo-filled"
                density="compact"
                rows="3"
                :error-messages="jsonError"
                class="mb-3"
                placeholder='{"top_p": 0.9, "frequency_penalty": 0.5}'
              />
            </v-form>
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn @click="formDialog = false">取消</v-btn>
            <v-btn color="red" :loading="modelSaving" @click="submitModelForm">
              {{ isEditModel ? '保存' : '创建' }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- 删除确认 -->
      <v-dialog v-model="deleteDialog" max-width="400">
        <v-card>
          <v-card-title>确认删除</v-card-title>
          <v-card-text>
            确定要删除模型 <strong>{{ deletingModel?.modelName }}</strong> 吗？
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn @click="deleteDialog = false">取消</v-btn>
            <v-btn color="error" :loading="deleteLoading" @click="doDelete">删除</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
        {{ snackbarText }}
      </v-snackbar>
    </v-card>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useLLMStore } from '@/stores/llm'
import type { ModelItem } from '@/apis/llm'
import PageLayout from '@/layouts/PageLayout.vue'

const store = useLLMStore()

const filterProvider = ref<string | null>(null)
const formDialog = ref(false)
const editingModel = ref<ModelItem | null>(null)
const deleteDialog = ref(false)
const deletingModel = ref<ModelItem | null>(null)
const deleteLoading = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('error')

function showSnackbar(text: string, color = 'error') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

const providerOptions = computed(() => store.providers.map((p) => ({ title: p.name, value: p.id })))

const headers = [
  { title: '模型名称', key: 'modelName', sortable: false },
  { title: '提供商', key: 'providerName', sortable: false },
  { title: '价格 (CNY/M tokens)', key: 'price', sortable: false },
  { title: '温度', key: 'temperature', sortable: false },
  { title: '最大 Token', key: 'maxTokens', sortable: false },
  { title: '强制流式', key: 'forceStream', sortable: false },
  { title: '操作', key: 'actions', sortable: false, align: 'end' as const },
]

/* 模型表单状态 */

const isEditModel = computed(() => !!editingModel.value)
const modelSaving = ref(false)
const modelFormRef = ref()
const jsonError = ref('')

const modelForm = ref({
  providerId: '',
  modelName: '',
  displayName: '',
  inputPrice: 0,
  outputPrice: 0,
  temperature: 0.7,
  maxTokens: null as number | null,
  forceStream: false,
})

const extraParamsStr = ref('{}')

const rules = {
  required: (v: string) => !!v || '此字段不能为空',
}

watch(formDialog, (open) => {
  if (open) {
    jsonError.value = ''
    if (editingModel.value) {
      modelForm.value = {
        providerId: editingModel.value.providerId,
        modelName: editingModel.value.modelName,
        displayName: editingModel.value.displayName ?? '',
        inputPrice: editingModel.value.inputPrice,
        outputPrice: editingModel.value.outputPrice,
        temperature: editingModel.value.temperature,
        maxTokens: editingModel.value.maxTokens,
        forceStream: editingModel.value.forceStream,
      }
      extraParamsStr.value = JSON.stringify(editingModel.value.extraParams || {}, null, 2)
    } else {
      modelForm.value = {
        providerId: '',
        modelName: '',
        displayName: '',
        inputPrice: 0,
        outputPrice: 0,
        temperature: 0.7,
        maxTokens: null,
        forceStream: false,
      }
      extraParamsStr.value = '{}'
    }
  }
})

/* 操作 */

function loadPage() {
  store.loadModels(filterProvider.value ?? undefined)
}

function openCreate() {
  editingModel.value = null
  formDialog.value = true
}

function openEdit(model: ModelItem) {
  editingModel.value = model
  formDialog.value = true
}

function confirmDelete(model: ModelItem) {
  deletingModel.value = model
  deleteDialog.value = true
}

async function doDelete() {
  if (!deletingModel.value) return
  deleteLoading.value = true
  try {
    await store.deleteModel(deletingModel.value.id)
  } catch {
    showSnackbar('删除失败，请重试')
  } finally {
    deleteLoading.value = false
    deleteDialog.value = false
  }
}

async function submitModelForm() {
  const result = await modelFormRef.value?.validate()
  const valid = result?.valid
  if (!valid) return

  // 校验 JSON
  let extraParams: Record<string, unknown> = {}
  try {
    extraParams = JSON.parse(extraParamsStr.value || '{}')
    jsonError.value = ''
  } catch {
    jsonError.value = '无效的 JSON 格式'
    return
  }

  modelSaving.value = true
  try {
    if (isEditModel.value && editingModel.value) {
      await store.updateModel(editingModel.value.id, {
        displayName: modelForm.value.displayName || null,
        inputPrice: modelForm.value.inputPrice,
        outputPrice: modelForm.value.outputPrice,
        temperature: modelForm.value.temperature,
        maxTokens: modelForm.value.maxTokens,
        forceStream: modelForm.value.forceStream,
        extraParams: extraParams,
      })
    } else {
      await store.createModel({
        providerId: modelForm.value.providerId,
        modelName: modelForm.value.modelName,
        displayName: modelForm.value.displayName || null,
        inputPrice: modelForm.value.inputPrice,
        outputPrice: modelForm.value.outputPrice,
        temperature: modelForm.value.temperature,
        maxTokens: modelForm.value.maxTokens,
        forceStream: modelForm.value.forceStream,
        extraParams: extraParams,
      })
    }
    loadPage()
    formDialog.value = false
  } catch {
    showSnackbar('保存失败，请重试')
  } finally {
    modelSaving.value = false
  }
}

onMounted(() => {
  store.loadProviders()
  loadPage()
})
</script>
