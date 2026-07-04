/**
 * useSettingsEditor —— path 感知的配置读写 Composable。
 * 支持任意深度的 Path（系统级/群/群内成员/私聊用户/业务自定义），可按前缀和分类过滤。
 */

import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { fetchSettingValues, setSettingValue, batchSetSettingValues } from '@/apis/settings'
import type { Path, SettingValue } from '@/apis/settings'
import { useSettingsSchemaStore } from '@/stores/settingsSchema'

export function useSettingsEditor(options: {
  prefix?: string
  path: Ref<Path>
  category?: 'permission' | 'config'
}) {
  const values = ref<Record<string, SettingValue>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function reload(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      let raw = await fetchSettingValues(options.path.value, options.prefix)

      // 按 category 过滤（客户端侧，依赖 schema store）
      if (options.category) {
        const schemaStore = useSettingsSchemaStore()
        await schemaStore.ensureLoaded()
        const allowedKeys = new Set(
          schemaStore.schemas.filter((sc) => sc.category === options.category).map((sc) => sc.key),
        )
        raw = Object.fromEntries(Object.entries(raw).filter(([k]) => allowedKeys.has(k)))
      }

      values.value = raw
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '加载配置失败'
    } finally {
      loading.value = false
    }
  }

  /** 保存单项配置，value 为 null 时后端会重置为默认值（回退到上一级）。 */
  async function save(key: string, value: unknown): Promise<void> {
    try {
      await setSettingValue(options.path.value, key, value)
      // 乐观更新本地状态：写入场景的覆盖深度即当前 path 长度，重置场景（value=null）
      // 无法在本地推算真实回退深度，需重新拉取才能得到准确值，交由调用方决定是否 reload
      values.value[key] = {
        value,
        overridden: value !== null,
        overriddenAtDepth: value === null ? null : options.path.value.length,
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '保存失败'
      throw e
    }
  }

  /** 重置配置项为默认值（POST value=null），重置后重新拉取实际回退值。 */
  async function reset(key: string): Promise<void> {
    await save(key, null)
    await reload()
  }

  /** 批量保存指定 path 下的配置，不再限定仅群维度。 */
  async function batchSave(entries: { key: string; value: unknown }[]): Promise<void> {
    try {
      await batchSetSettingValues(options.path.value, entries)
      for (const entry of entries) {
        values.value[entry.key] = {
          value: entry.value,
          overridden: entry.value !== null,
          overriddenAtDepth: entry.value === null ? null : options.path.value.length,
        }
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '批量保存失败'
      throw e
    }
  }

  // path 变化时自动重新加载
  watch(() => options.path.value, reload, { deep: true, immediate: true })

  return { values, loading, error, save, reset, batchSave, reload }
}
