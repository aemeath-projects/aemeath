<script setup lang="ts">
import { ref, onMounted } from 'vue'
import PageLayout from '@/layouts/PageLayout.vue'
import {
  listPools,
  createPool,
  deletePool,
  listPoolGroups,
  assignGroupPool,
  type PoolInfo,
} from '@/apis/driftBottle'

const pools = ref<PoolInfo[]>([])
const selectedPool = ref<PoolInfo | null>(null)
const groupIds = ref<number[]>([])
const loading = ref(false)

const createDialog = ref(false)
const deleteDialog = ref(false)
const deleteTarget = ref<PoolInfo | null>(null)
const newPoolName = ref('')
const assignGroupId = ref<string>('')

async function loadPools() {
  loading.value = true
  try {
    pools.value = await listPools()
  } finally {
    loading.value = false
  }
}

async function selectPool(pool: PoolInfo) {
  selectedPool.value = pool
  const res = await listPoolGroups(pool.id)
  groupIds.value = res.groupIds
}

async function onCreate() {
  if (!newPoolName.value.trim()) return
  await createPool(newPoolName.value.trim())
  createDialog.value = false
  newPoolName.value = ''
  await loadPools()
}

function confirmDelete(pool: PoolInfo) {
  deleteTarget.value = pool
  deleteDialog.value = true
}

async function onDeleteExecute() {
  if (!deleteTarget.value) return
  await deletePool(deleteTarget.value.id)
  if (selectedPool.value?.id === deleteTarget.value.id) {
    selectedPool.value = null
    groupIds.value = []
  }
  deleteDialog.value = false
  await loadPools()
}

async function onAssign() {
  const gid = parseInt(assignGroupId.value, 10)
  if (!selectedPool.value || isNaN(gid)) return
  await assignGroupPool(gid, selectedPool.value.id)
  assignGroupId.value = ''
  await selectPool(selectedPool.value)
}

onMounted(loadPools)
</script>

<template>
  <PageLayout>
    <v-row>
      <!-- 左侧：池列表 -->
      <v-col cols="12" md="4">
        <div class="d-flex align-center mb-2">
          <span class="text-subtitle-2">漂流瓶池</span>
          <v-spacer />
          <v-btn size="small" icon="mdi-plus" variant="text" @click="createDialog = true" />
        </div>
        <v-skeleton-loader v-if="loading" type="list-item-two-line" />
        <v-list v-else nav density="compact">
          <v-list-item
            v-for="pool in pools"
            :key="pool.id"
            :title="pool.name"
            :subtitle="`${pool.availableCount} 瓶`"
            :active="selectedPool?.id === pool.id"
            rounded="lg"
            @click="selectPool(pool)"
          >
            <template #append>
              <v-btn
                v-if="pool.id !== 0"
                size="x-small"
                icon="mdi-delete"
                variant="text"
                color="error"
                @click.stop="confirmDelete(pool)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-col>

      <!-- 右侧：群组详情 -->
      <v-col cols="12" md="8">
        <template v-if="selectedPool">
          <div class="d-flex align-center mb-2">
            <span class="text-subtitle-2">{{ selectedPool.name }} — 绑定群组</span>
          </div>
          <div class="d-flex ga-2 mb-3">
            <v-text-field
              v-model="assignGroupId"
              label="群号"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 200px"
            />
            <v-btn color="primary" @click="onAssign">分配</v-btn>
          </div>
          <div v-if="groupIds.length" class="d-flex flex-wrap ga-2">
            <v-chip v-for="gid in groupIds" :key="gid" label>{{ gid }}</v-chip>
          </div>
          <v-empty-state v-else icon="mdi-bottle-tonic" title="暂无绑定群组" />
        </template>
        <v-empty-state v-else icon="mdi-bottle-tonic-outline" title="请选择一个漂流瓶池" />
      </v-col>
    </v-row>

    <!-- 新建池 Dialog -->
    <v-dialog v-model="createDialog" max-width="360">
      <v-card title="新建漂流瓶池">
        <v-card-text>
          <v-text-field v-model="newPoolName" label="池名称" autofocus />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="createDialog = false">取消</v-btn>
          <v-btn color="primary" @click="onCreate">创建</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 删除确认 Dialog -->
    <v-dialog v-model="deleteDialog" max-width="360">
      <v-card title="确认删除">
        <v-card-text
          >删除池「{{ deleteTarget?.name }}」？该池内的漂流瓶将被移回默认池。</v-card-text
        >
        <v-card-actions>
          <v-spacer />
          <v-btn @click="deleteDialog = false">取消</v-btn>
          <v-btn color="error" @click="onDeleteExecute">删除</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>
