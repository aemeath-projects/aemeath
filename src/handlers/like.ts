/**
 * 点赞 Bot 处理器 —— 响应 /like 或 /点赞 命令。
 */

import { Inject } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'

import {
  Handler,
  OnCommand,
  Scope,
  PermissionDecorator,
  Permission,
} from '@/core/dispatch/index.js'
import type { OneBotContext as Context } from '@/core/dispatch/index.js'
import { SettingNode } from '@/core/settings/index.js'
import type { LikeService } from '@/services/like.js'

const DEFAULT_LIKE_TIMES = 10

const USAGE =
  '用法：\n' +
  '  /like [n]       立即点赞 n 次（默认 10）\n' +
  '  /like schedule  注册每日定时点赞\n' +
  '  /like cancel    取消定时点赞\n' +
  '  /like status    查看状态与统计'

@Handler({
  name: 'like',
  displayName: '点赞',
  description: '给自己 QQ 主页点赞，支持手动和每日定时自动点赞',
  tags: ['fun'],
})
@SettingNode('enabled', {
  type: 'boolean',
  default: true,
  description: '是否启用点赞功能',
})
@SettingNode('permission', {
  type: 'enum',
  default: 'ANYONE',
  enumOptions: Permission,
  description: '最低权限等级',
})
class LikeHandler {
  private readonly _log: PinoLogger = getLogger('like') as unknown as PinoLogger

  @Inject('like_service')
  private readonly likeService!: LikeService

  /** 解析参数并分发到对应子命令。 */
  @OnCommand('like', { aliases: ['点赞'] })
  @Scope('all')
  @PermissionDecorator(0)
  async handle(ctx: Context): Promise<void> {
    const qq = ctx.userId
    const args = ctx.getArgs()
    const sub = args?.[0]?.toLowerCase() ?? ''

    if (sub === 'schedule' || sub === '定时') {
      await handleSchedule(ctx, this.likeService, qq, this._log)
    } else if (sub === 'cancel' || sub === '取消') {
      await handleCancel(ctx, this.likeService, qq, this._log)
    } else if (sub === 'status' || sub === '状态') {
      await handleStatus(ctx, this.likeService, qq, this._log)
    } else if (sub === '' || /^\d+$/u.test(sub)) {
      await handleSend(ctx, this.likeService, qq, sub)
    } else {
      await ctx.reply(USAGE)
    }
  }
}

/** 执行立即点赞。 */
async function handleSend(ctx: Context, svc: LikeService, qq: string, sub: string): Promise<void> {
  let times = DEFAULT_LIKE_TIMES
  if (/^\d+$/u.test(sub)) {
    const n = parseInt(sub, 10)
    if (n < 1 || n > 20) {
      await ctx.reply('点赞次数范围为 1~20')
      return
    }
    times = n
  }

  const success = await svc.sendLikeNow(qq, times, 'manual')
  if (success) {
    await ctx.reply(`已给你点赞 ${String(times)} 次 👍`)
  } else {
    await ctx.reply('点赞失败，请稍后重试')
  }
}

/** 注册定时点赞任务。 */
async function handleSchedule(
  ctx: Context,
  svc: LikeService,
  qq: string,
  log: PinoLogger,
): Promise<void> {
  try {
    const groupId = ctx.groupId ?? null
    const result = await svc.registerTask(qq, groupId)
    if (result.alreadyExists) {
      await ctx.reply('你已经注册过每日定时点赞了～')
    } else {
      await ctx.reply(`已注册每日定时点赞！每天零点自动给你点赞 ${String(DEFAULT_LIKE_TIMES)} 次`)
    }
  } catch (err) {
    log.error({ qq, err }, '注册定时点赞失败')
    await ctx.reply('注册失败，请稍后重试')
  }
}

/** 取消定时点赞任务。 */
async function handleCancel(
  ctx: Context,
  svc: LikeService,
  qq: string,
  log: PinoLogger,
): Promise<void> {
  try {
    const deleted = await svc.cancelTask(qq)
    if (deleted) {
      await ctx.reply('已取消每日定时点赞')
    } else {
      await ctx.reply('你还没有注册定时点赞哦')
    }
  } catch (err) {
    log.error({ qq, err }, '取消定时点赞失败')
    await ctx.reply('取消失败，请稍后重试')
  }
}

/** 查询点赞状态与统计。 */
async function handleStatus(
  ctx: Context,
  svc: LikeService,
  qq: string,
  log: PinoLogger,
): Promise<void> {
  try {
    const status = await svc.getStatus(qq)
    const taskInfo = status.hasTask ? '✅ 已开启每日定时点赞' : '❌ 未开启定时点赞'
    const lastTime = status.lastTriggeredAt
      ? new Date(status.lastTriggeredAt).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '暂无'
    await ctx.reply(
      `点赞状态\n${taskInfo}\n累计已点赞：${String(status.totalTimes)} 次\n最近点赞：${lastTime}`,
    )
  } catch (err) {
    log.error({ qq, err }, '查询点赞状态失败')
    await ctx.reply('查询失败，请稍后重试')
  }
}

export { LikeHandler }
