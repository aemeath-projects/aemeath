<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>
        {{ isEdit ? '编辑提供商' : '添加提供商' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="submitForm">
          <v-text-field
            v-model="form.name"
            label="提供商名称"
            :rules="[rules.required]"
            variant="solo-filled"
            density="compact"
            class="mb-3"
            placeholder="如 OpenAI、DeepSeek"
          />
          <v-select
            v-model="form.type"
            label="协议类型"
            :items="typeOptions"
            :rules="[rules.required]"
            variant="solo-filled"
            density="compact"
            class="mb-3"
          />
          <v-text-field
            v-model="form.apiBase"
            label="API 基础地址"
            :rules="[rules.required]"
            variant="solo-filled"
            density="compact"
            class="mb-3"
            placeholder="https://api.openai.com/v1"
          />
          <v-text-field
            v-model="form.apiKey"
            :label="isEdit ? 'API Key (留空则不修改)' : 'API Key'"
            :rules="isEdit ? [] : [rules.required]"
            variant="solo-filled"
            density="compact"
            class="mb-3"
            :type="showKey ? 'text' : 'password'"
            :append-inner-icon="showKey ? 'mdi-eye-off' : 'mdi-eye'"
            placeholder="sk-..."
            @click:append-inner="showKey = !showKey"
          />
          <v-row dense class="mb-3">
            <v-col cols="4">
              <v-text-field
                v-model.number="form.maxRetries"
                label="最大重试"
                type="number"
                variant="solo-filled"
                density="compact"
                :rules="[rules.nonNegativeInt]"
                suffix="次"
                min="0"
                max="10"
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                v-model.number="form.timeout"
                label="超时"
                type="number"
                variant="solo-filled"
                density="compact"
                :rules="[rules.positiveInt]"
                suffix="秒"
                min="1"
                max="600"
              />
            </v-col>
            <v-col cols="4">
              <v-text-field
                v-model.number="form.retryInterval"
                label="重试间隔"
                type="number"
                variant="solo-filled"
                density="compact"
                :rules="[rules.nonNegativeInt]"
                suffix="秒"
                min="0"
                max="60"
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="emit('update:modelValue', false)">取消</v-btn>
        <v-btn color="red" :loading="saving" @click="submitForm">
          {{ isEdit ? '保存' : '创建' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useLLMStore } from '@/stores/llm'
import type { ProviderItem, LlmProviderType } from '@/apis/llm'

const typeOptions = [
  { title: 'OpenAI 兼容', value: 'openai' },
  { title: 'Anthropic', value: 'anthropic' },
  { title: 'Gemini', value: 'gemini' },
]

const props = defineProps<{
  modelValue: boolean
  provider: ProviderItem | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
  error: [message: string]
}>()

const store = useLLMStore()

const isEdit = computed(() => !!props.provider)
const showKey = ref(false)
const saving = ref(false)
const formRef = ref()

function defaultForm(): {
  name: string
  type: LlmProviderType | undefined
  apiBase: string
  apiKey: string
  maxRetries: number
  timeout: number
  retryInterval: number
} {
  return {
    name: '',
    type: undefined,
    apiBase: '',
    apiKey: '',
    maxRetries: 2,
    timeout: 60,
    retryInterval: 1,
  }
}

const form = ref(defaultForm())

const rules = {
  required: (v: string) => !!v || '此字段不能为空',
  nonNegativeInt: (v: number) => (Number.isInteger(v) && v >= 0) || '请输入非负整数',
  positiveInt: (v: number) => (Number.isInteger(v) && v >= 1) || '请输入正整数',
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (props.provider) {
        form.value = {
          name: props.provider.name,
          type: props.provider.type,
          apiBase: props.provider.apiBase,
          apiKey: '',
          maxRetries: props.provider.maxRetries,
          timeout: props.provider.timeout,
          retryInterval: props.provider.retryInterval,
        }
      } else {
        form.value = defaultForm()
      }
      showKey.value = false
    }
  },
)

async function submitForm() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return

  saving.value = true
  try {
    if (isEdit.value && props.provider) {
      const payload: Record<string, unknown> = {}
      if (form.value.name !== props.provider.name) payload.name = form.value.name
      if (form.value.type !== props.provider.type) payload.type = form.value.type
      if (form.value.apiBase !== props.provider.apiBase) payload.apiBase = form.value.apiBase
      if (form.value.apiKey) payload.apiKey = form.value.apiKey
      if (form.value.maxRetries !== props.provider.maxRetries)
        payload.maxRetries = form.value.maxRetries
      if (form.value.timeout !== props.provider.timeout) payload.timeout = form.value.timeout
      if (form.value.retryInterval !== props.provider.retryInterval)
        payload.retryInterval = form.value.retryInterval
      await store.updateProvider(props.provider.id, payload)
    } else {
      await store.createProvider({
        name: form.value.name,
        type: form.value.type as LlmProviderType,
        apiBase: form.value.apiBase,
        apiKey: form.value.apiKey,
        maxRetries: form.value.maxRetries,
        timeout: form.value.timeout,
        retryInterval: form.value.retryInterval,
      })
    }
    emit('update:modelValue', false)
    emit('saved')
  } catch {
    emit('error', '保存失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>
