import { select } from '@inquirer/prompts'

import { actions as api, label as apiLabel } from './modules/api.js'
import { actions as db, label as dbLabel } from './modules/db.js'
import { actions as queue, label as queueLabel } from './modules/queue.js'
import { actions as redis, label as redisLabel } from './modules/redis.js'
import { actions as service, label as serviceLabel } from './modules/service.js'

type Action = () => Promise<void>

interface SubMenu {
  label: string
  choices: { name: string; value: Action }[]
}

const subMenus: SubMenu[] = [
  {
    label: apiLabel,
    choices: [
      { name: '列出所有路由', value: api.listRoutes },
      { name: '测试端点', value: api.testEndpoint },
    ],
  },
  {
    label: redisLabel,
    choices: [
      { name: '查看 Redis 统计', value: redis.showStats },
      { name: '清除缓存', value: redis.flushCache },
    ],
  },
  {
    label: queueLabel,
    choices: [
      { name: '查看队列状态', value: queue.listJobs },
      { name: '重试失败任务', value: queue.retryFailed },
    ],
  },
  {
    label: dbLabel,
    choices: [
      { name: '查看迁移状态', value: db.showMigrations },
      { name: '执行 Seed', value: db.runSeed },
    ],
  },
  {
    label: serviceLabel,
    choices: [
      { name: '健康检查', value: service.healthCheck },
      { name: '查看配置', value: service.showConfig },
    ],
  },
]

async function runSubMenu(menu: SubMenu): Promise<void> {
  const action = await select<Action>({
    message: `${menu.label} — 选择操作`,
    choices: menu.choices,
  })
  await action()
}

export async function runMenu(): Promise<void> {
  console.log('\n  aemeath 开发工具箱\n')

  for (;;) {
    const selected = await select<SubMenu | null>({
      message: '选择模块',
      choices: [
        ...subMenus.map((m) => ({ name: m.label, value: m })),
        { name: '退出', value: null },
      ],
    })

    if (selected === null) break
    await runSubMenu(selected)
    console.log()
  }
}
