/**
 * OneBot 11 标准 API 封装 —— 通过 WebSocket 发送指令并等待响应。
 */

import { randomUUID } from 'node:crypto'

import type { APIResponse } from './models/api.js'
import type { MessageSegment } from './models/segments.js'

/** 默认 API 调用超时时间（毫秒）。 */
const DEFAULT_TIMEOUT_MS = 30_000

/** 挂起中的 API 调用句柄。 */
interface PendingCall {
  resolve: (data: APIResponse) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * OneBot 11 标准 API 客户端。
 *
 * 通过 `send` 回调将请求发往 WebSocket 连接，
 * 并通过 `echo` 字段将响应与挂起的 Promise 匹配。
 */
export class BotAPI {
  private readonly pending = new Map<string, PendingCall>()
  private readonly send: (data: string) => void

  constructor(send: (data: string) => void) {
    this.send = send
  }

  /** 处理来自 WebSocket 的 API 响应，匹配 echo 字段，解析对应的 Promise。 */
  handleResponse(response: APIResponse): void {
    const call = this.pending.get(response.echo)
    if (!call) {
      return
    }
    clearTimeout(call.timer)
    this.pending.delete(response.echo)
    call.resolve(response)
  }

  /** 核心调用方法：发送 action 并等待 echo 响应。 */
  protected async call(
    action: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<APIResponse> {
    const echo = randomUUID()
    const payload = JSON.stringify({ action, params, echo })

    return new Promise<APIResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo)
        reject(new Error(`API 调用超时: action=${action}, echo=${echo}`))
      }, timeoutMs)

      this.pending.set(echo, { resolve, reject, timer })

      try {
        this.send(payload)
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(echo)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  // ── 消息 API ──

  /** 发送私聊消息。 */
  async sendPrivateMsg(
    userId: number,
    message: MessageSegment[] | string,
    autoEscape = false,
  ): Promise<APIResponse> {
    const msg = Array.isArray(message) ? message : message
    return this.call('send_private_msg', {
      user_id: userId,
      message: msg,
      auto_escape: autoEscape,
    })
  }

  /** 发送群消息。 */
  async sendGroupMsg(
    groupId: number,
    message: MessageSegment[] | string,
    autoEscape = false,
  ): Promise<APIResponse> {
    const msg = Array.isArray(message) ? message : message
    return this.call('send_group_msg', {
      group_id: groupId,
      message: msg,
      auto_escape: autoEscape,
    })
  }

  /** 发送消息（通用）。 */
  async sendMsg(opts: {
    messageType?: string
    userId?: number
    groupId?: number
    message: MessageSegment[] | string
    autoEscape?: boolean
  }): Promise<APIResponse> {
    const params: Record<string, unknown> = {
      message: opts.message,
      auto_escape: opts.autoEscape ?? false,
    }
    if (opts.messageType !== undefined) params.message_type = opts.messageType
    if (opts.userId !== undefined) params.user_id = opts.userId
    if (opts.groupId !== undefined) params.group_id = opts.groupId
    return this.call('send_msg', params)
  }

  /** 撤回消息。 */
  async deleteMsg(messageId: number): Promise<APIResponse> {
    return this.call('delete_msg', { message_id: messageId })
  }

  /** 获取消息详情。 */
  async getMsg(messageId: number): Promise<APIResponse> {
    return this.call('get_msg', { message_id: messageId })
  }

  /** 获取合并转发消息。 */
  async getForwardMsg(forwardId: string): Promise<APIResponse> {
    return this.call('get_forward_msg', { id: forwardId })
  }

  /** 发送点赞。 */
  async sendLike(userId: number, times = 1): Promise<APIResponse> {
    return this.call('send_like', { user_id: userId, times })
  }

  // ── 群管理 API ──

  /** 踢出群成员。 */
  async setGroupKick(
    groupId: number,
    userId: number,
    rejectAddRequest = false,
  ): Promise<APIResponse> {
    return this.call('set_group_kick', {
      group_id: groupId,
      user_id: userId,
      reject_add_request: rejectAddRequest,
    })
  }

  /** 禁言群成员。 */
  async setGroupBan(groupId: number, userId: number, duration = 1800): Promise<APIResponse> {
    return this.call('set_group_ban', { group_id: groupId, user_id: userId, duration })
  }

  /** 全体禁言。 */
  async setGroupWholeBan(groupId: number, enable = true): Promise<APIResponse> {
    return this.call('set_group_whole_ban', { group_id: groupId, enable })
  }

  /** 设置群管理员。 */
  async setGroupAdmin(groupId: number, userId: number, enable = true): Promise<APIResponse> {
    return this.call('set_group_admin', { group_id: groupId, user_id: userId, enable })
  }

  /** 设置群名片。 */
  async setGroupCard(groupId: number, userId: number, card = ''): Promise<APIResponse> {
    return this.call('set_group_card', { group_id: groupId, user_id: userId, card })
  }

  /** 设置群名。 */
  async setGroupName(groupId: number, groupName: string): Promise<APIResponse> {
    return this.call('set_group_name', { group_id: groupId, group_name: groupName })
  }

  /** 退出群组。 */
  async setGroupLeave(groupId: number, isDismiss = false): Promise<APIResponse> {
    return this.call('set_group_leave', { group_id: groupId, is_dismiss: isDismiss })
  }

  /** 设置群成员专属头衔。 */
  async setGroupSpecialTitle(
    groupId: number,
    userId: number,
    specialTitle = '',
  ): Promise<APIResponse> {
    return this.call('set_group_special_title', {
      group_id: groupId,
      user_id: userId,
      special_title: specialTitle,
    })
  }

  // ── 请求处理 ──

  /** 处理好友添加请求。 */
  async setFriendAddRequest(flag: string, approve = true, remark = ''): Promise<APIResponse> {
    return this.call('set_friend_add_request', { flag, approve, remark })
  }

  /** 处理群添加请求。 */
  async setGroupAddRequest(
    flag: string,
    subType: string,
    approve = true,
    reason = '',
  ): Promise<APIResponse> {
    return this.call('set_group_add_request', { flag, sub_type: subType, approve, reason })
  }

  // ── 信息获取 ──

  /** 获取登录账号信息。 */
  async getLoginInfo(): Promise<APIResponse> {
    return this.call('get_login_info')
  }

  /** 获取陌生人信息。 */
  async getStrangerInfo(userId: number, noCache = false): Promise<APIResponse> {
    return this.call('get_stranger_info', { user_id: userId, no_cache: noCache })
  }

  /** 获取好友列表。 */
  async getFriendList(): Promise<APIResponse> {
    return this.call('get_friend_list')
  }

  /** 获取群信息。 */
  async getGroupInfo(groupId: number, noCache = false): Promise<APIResponse> {
    return this.call('get_group_info', { group_id: groupId, no_cache: noCache })
  }

  /** 获取群列表。 */
  async getGroupList(): Promise<APIResponse> {
    return this.call('get_group_list')
  }

  /** 获取群成员信息。 */
  async getGroupMemberInfo(groupId: number, userId: number, noCache = false): Promise<APIResponse> {
    return this.call('get_group_member_info', {
      group_id: groupId,
      user_id: userId,
      no_cache: noCache,
    })
  }

  /** 获取群成员列表。 */
  async getGroupMemberList(groupId: number): Promise<APIResponse> {
    return this.call('get_group_member_list', { group_id: groupId })
  }

  /** 获取群荣誉信息。 */
  async getGroupHonorInfo(groupId: number, honorType = 'all'): Promise<APIResponse> {
    return this.call('get_group_honor_info', { group_id: groupId, type: honorType })
  }

  // ── 媒体 ──

  /** 获取图片信息。 */
  async getImage(file: string): Promise<APIResponse> {
    return this.call('get_image', { file })
  }

  /** 获取语音文件。 */
  async getRecord(file: string, outFormat = 'mp3'): Promise<APIResponse> {
    return this.call('get_record', { file, out_format: outFormat })
  }

  /** 检查是否可以发送图片。 */
  async canSendImage(): Promise<APIResponse> {
    return this.call('can_send_image')
  }

  /** 检查是否可以发送语音。 */
  async canSendRecord(): Promise<APIResponse> {
    return this.call('can_send_record')
  }

  // ── 系统 ──

  /** 获取版本信息。 */
  async getVersionInfo(): Promise<APIResponse> {
    return this.call('get_version_info')
  }

  /** 获取运行状态。 */
  async getStatus(): Promise<APIResponse> {
    return this.call('get_status')
  }

  /** 清理缓存。 */
  async cleanCache(): Promise<APIResponse> {
    return this.call('clean_cache')
  }

  // ── go-cqhttp 兼容扩展 ──

  /** 设置 QQ 资料。 */
  async setQqProfile(nickname: string, personalNote = '', sex?: number): Promise<APIResponse> {
    const params: Record<string, unknown> = { nickname }
    if (personalNote) params.personal_note = personalNote
    if (sex !== undefined) params.sex = sex
    return this.call('set_qq_profile', params)
  }

  /** 标记消息为已读。 */
  async markMsgAsRead(opts: {
    messageId?: number
    userId?: number
    groupId?: number
  }): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (opts.messageId !== undefined) params.message_id = opts.messageId
    if (opts.userId !== undefined) params.user_id = opts.userId
    if (opts.groupId !== undefined) params.group_id = opts.groupId
    return this.call('mark_msg_as_read', params)
  }

  /** 发送群合并转发消息。 */
  async sendGroupForwardMsg(
    groupId: number,
    messages: Record<string, unknown>[],
  ): Promise<APIResponse> {
    return this.call('send_group_forward_msg', { group_id: groupId, messages })
  }

  /** 发送私聊合并转发消息。 */
  async sendPrivateForwardMsg(
    userId: number,
    messages: Record<string, unknown>[],
  ): Promise<APIResponse> {
    return this.call('send_private_forward_msg', { user_id: userId, messages })
  }

  /** 获取群历史消息。 */
  async getGroupMsgHistory(groupId: number, messageSeq?: number, count = 20): Promise<APIResponse> {
    const params: Record<string, unknown> = { group_id: groupId, count }
    if (messageSeq !== undefined) params.message_seq = messageSeq
    return this.call('get_group_msg_history', params)
  }

  /** 设置精华消息。 */
  async setEssenceMsg(messageId: number): Promise<APIResponse> {
    return this.call('set_essence_msg', { message_id: messageId })
  }

  /** 删除精华消息。 */
  async deleteEssenceMsg(messageId: number): Promise<APIResponse> {
    return this.call('delete_essence_msg', { message_id: messageId })
  }

  /** 获取精华消息列表。 */
  async getEssenceMsgList(groupId: number): Promise<APIResponse> {
    return this.call('get_essence_msg_list', { group_id: groupId })
  }

  /** OCR 识别图片。 */
  async ocrImage(image: string): Promise<APIResponse> {
    return this.call('ocr_image', { image })
  }

  /** 上传群文件。 */
  async uploadGroupFile(
    groupId: number,
    file: string,
    name: string,
    folder = '',
  ): Promise<APIResponse> {
    return this.call('upload_group_file', { group_id: groupId, file, name, folder })
  }

  /** 上传私聊文件。 */
  async uploadPrivateFile(userId: number, file: string, name: string): Promise<APIResponse> {
    return this.call('upload_private_file', { user_id: userId, file, name })
  }

  /** 获取群文件系统信息。 */
  async getGroupFileSystemInfo(groupId: number): Promise<APIResponse> {
    return this.call('get_group_file_system_info', { group_id: groupId })
  }

  /** 获取群根目录文件列表。 */
  async getGroupRootFiles(groupId: number): Promise<APIResponse> {
    return this.call('get_group_root_files', { group_id: groupId })
  }

  /** 获取群文件下载链接。 */
  async getGroupFileUrl(groupId: number, fileId: string, busid?: number): Promise<APIResponse> {
    const params: Record<string, unknown> = { group_id: groupId, file_id: fileId }
    if (busid !== undefined) params.busid = busid
    return this.call('get_group_file_url', params)
  }

  /** 下载文件。 */
  async downloadFile(opts: {
    url?: string
    base64?: string
    name?: string
    headers?: string | string[]
  }): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (opts.url) params.url = opts.url
    if (opts.base64) params.base64 = opts.base64
    if (opts.name) params.name = opts.name
    if (opts.headers) params.headers = opts.headers
    return this.call('download_file', params)
  }

  /** 删除好友。 */
  async deleteFriend(userId: number): Promise<APIResponse> {
    return this.call('delete_friend', { user_id: userId })
  }

  /** 发送合并转发消息（通用）。 */
  async sendForwardMsg(opts: {
    messages: Record<string, unknown>[]
    messageType?: string
    userId?: number
    groupId?: number
  }): Promise<APIResponse> {
    const params: Record<string, unknown> = { messages: opts.messages }
    if (opts.messageType !== undefined) params.message_type = opts.messageType
    if (opts.userId !== undefined) params.user_id = opts.userId
    if (opts.groupId !== undefined) params.group_id = opts.groupId
    return this.call('send_forward_msg', params)
  }

  /** 发布群公告。 */
  async sendGroupNotice(groupId: number, content: string, image = ''): Promise<APIResponse> {
    const params: Record<string, unknown> = { group_id: groupId, content }
    if (image) params.image = image
    return this.call('_send_group_notice', params)
  }

  /** 获取群公告列表。 */
  async getGroupNotice(groupId: number): Promise<APIResponse> {
    return this.call('_get_group_notice', { group_id: groupId })
  }

  /** 删除群公告。 */
  async deleteGroupNotice(groupId: number, noticeId: string): Promise<APIResponse> {
    return this.call('_del_group_notice', { group_id: groupId, notice_id: noticeId })
  }

  /** 获取群 @全体成员 剩余次数。 */
  async getGroupAtAllRemain(groupId: number): Promise<APIResponse> {
    return this.call('get_group_at_all_remain', { group_id: groupId })
  }

  /** 获取群系统消息。 */
  async getGroupSystemMsg(): Promise<APIResponse> {
    return this.call('get_group_system_msg', {})
  }

  /** 获取 QQ 域名 Cookie。 */
  async getCookies(domain = ''): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (domain) params.domain = domain
    return this.call('get_cookies', params)
  }

  /** 获取 CSRF Token。 */
  async getCsrfToken(): Promise<APIResponse> {
    return this.call('get_csrf_token', {})
  }

  /** 同时获取 Cookie 和 CSRF Token。 */
  async getCredentials(domain = ''): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (domain) params.domain = domain
    return this.call('get_credentials', params)
  }

  /** 获取已登录设备列表。 */
  async getOnlineClients(noCache = false): Promise<APIResponse> {
    return this.call('get_online_clients', { no_cache: noCache })
  }

  /** 检查 URL 安全性。 */
  async checkUrlSafely(url: string): Promise<APIResponse> {
    return this.call('check_url_safely', { url })
  }

  /** 快速操作。 */
  async handleQuickOperation(
    context: Record<string, unknown>,
    operation: Record<string, unknown>,
  ): Promise<APIResponse> {
    return this.call('.handle_quick_operation', { context, operation })
  }

  /** 获取中文分词结果。 */
  async getWordSlices(content: string): Promise<APIResponse> {
    return this.call('.get_word_slices', { content })
  }

  // ── 文件操作扩展 ──

  /** 删除群文件。 */
  async deleteGroupFile(groupId: number, fileId: string, busid: number): Promise<APIResponse> {
    return this.call('delete_group_file', { group_id: groupId, file_id: fileId, busid })
  }

  /** 创建群文件文件夹。 */
  async createGroupFileFolder(groupId: number, name: string): Promise<APIResponse> {
    return this.call('create_group_file_folder', { group_id: groupId, name })
  }

  /** 删除群文件文件夹。 */
  async deleteGroupFolder(groupId: number, folderId: string): Promise<APIResponse> {
    return this.call('delete_group_folder', { group_id: groupId, folder_id: folderId })
  }

  /** 获取指定文件夹内的群文件列表。 */
  async getGroupFilesByFolder(groupId: number, folderId: string): Promise<APIResponse> {
    return this.call('get_group_files_by_folder', { group_id: groupId, folder_id: folderId })
  }

  /** 移动群文件到指定目录。 */
  async moveGroupFile(groupId: number, fileId: string, targetDir: string): Promise<APIResponse> {
    return this.call('move_group_file', {
      group_id: groupId,
      file_id: fileId,
      target_dir: targetDir,
    })
  }

  /** 将群文件转发至另一个群。 */
  async transGroupFile(
    groupId: number,
    fileId: string,
    targetGroupId: number,
  ): Promise<APIResponse> {
    return this.call('trans_group_file', {
      group_id: groupId,
      file_id: fileId,
      target_group_id: targetGroupId,
    })
  }

  /** 重命名群文件。 */
  async renameGroupFile(
    groupId: number,
    fileId: string,
    currentParentDirectory: string,
    newName: string,
  ): Promise<APIResponse> {
    return this.call('rename_group_file', {
      group_id: groupId,
      file_id: fileId,
      current_parent_directory: currentParentDirectory,
      new_name: newName,
    })
  }

  /** 获取私聊文件下载链接。 */
  async getPrivateFileUrl(userId: number, fileId: string): Promise<APIResponse> {
    return this.call('get_private_file_url', { user_id: userId, file_id: fileId })
  }

  /** 获取文件信息（通用）。 */
  async getFile(fileId: string): Promise<APIResponse> {
    return this.call('get_file', { file_id: fileId })
  }

  // ── NapCat 扩展 ──

  /** 私聊戳一戳。 */
  async friendPoke(userId: number, targetId?: number): Promise<APIResponse> {
    const params: Record<string, unknown> = { user_id: userId }
    if (targetId !== undefined) params.target_id = targetId
    return this.call('friend_poke', params)
  }

  /** 群内戳一戳。 */
  async groupPoke(groupId: number, userId: number, targetId?: number): Promise<APIResponse> {
    const params: Record<string, unknown> = { group_id: groupId, user_id: userId }
    if (targetId !== undefined) params.target_id = targetId
    return this.call('group_poke', params)
  }

  /** 设置消息表情回应。 */
  async setMsgEmojiLike(messageId: number, emojiId: string, isSet = true): Promise<APIResponse> {
    return this.call('set_msg_emoji_like', { message_id: messageId, emoji_id: emojiId, set: isSet })
  }

  /** 获取 NapCat rkey。 */
  async ncGetRkey(): Promise<APIResponse> {
    return this.call('nc_get_rkey', {})
  }

  /** 获取 NapCat packet 状态。 */
  async ncGetPacketStatus(): Promise<APIResponse> {
    return this.call('nc_get_packet_status', {})
  }

  /** 获取带分类的好友列表。 */
  async getFriendsWithCategory(): Promise<APIResponse> {
    return this.call('get_friends_with_category', {})
  }

  /** 设置个人长签名。 */
  async setSelfLongnick(longNick: string): Promise<APIResponse> {
    return this.call('set_self_longnick', { longNick })
  }

  /** 获取 AI 角色列表。 */
  async getAiCharacters(groupId: number, chatType = 1): Promise<APIResponse> {
    return this.call('get_ai_characters', { group_id: groupId, chat_type: chatType })
  }

  /** 获取 AI 语音记录。 */
  async getAiRecord(character: string, groupId: number, text: string): Promise<APIResponse> {
    return this.call('get_ai_record', { character, group_id: groupId, text })
  }

  /** 发送群 AI 语音。 */
  async sendGroupAiRecord(groupId: number, character: string, text: string): Promise<APIResponse> {
    return this.call('send_group_ai_record', { group_id: groupId, character, text })
  }

  /** 翻译英文到中文。 */
  async translateEn2zh(words: string[]): Promise<APIResponse> {
    return this.call('translate_en2zh', { words })
  }

  /** 获取用户在线状态。 */
  async ncGetUserStatus(userId: number): Promise<APIResponse> {
    return this.call('nc_get_user_status', { user_id: userId })
  }

  /** 设置输入状态。 */
  async setInputStatus(userId: number, eventType: number): Promise<APIResponse> {
    return this.call('set_input_status', { user_id: userId, event_type: eventType })
  }

  /** 设置自定义在线状态。 */
  async setDiyOnlineStatus(faceId: number, faceType = 1, wording = ' '): Promise<APIResponse> {
    return this.call('set_diy_online_status', { face_id: faceId, face_type: faceType, wording })
  }

  /** 获取 rkey。 */
  async getRkey(): Promise<APIResponse> {
    return this.call('get_rkey', {})
  }

  /** 标记私聊消息为已读。 */
  async markPrivateMsgAsRead(opts: { messageId?: number; userId?: number }): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (opts.messageId !== undefined) params.message_id = opts.messageId
    if (opts.userId !== undefined) params.user_id = opts.userId
    return this.call('mark_private_msg_as_read', params)
  }

  /** 标记群消息为已读。 */
  async markGroupMsgAsRead(opts: { messageId?: number; groupId?: number }): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (opts.messageId !== undefined) params.message_id = opts.messageId
    if (opts.groupId !== undefined) params.group_id = opts.groupId
    return this.call('mark_group_msg_as_read', params)
  }

  /** 获取好友历史消息。 */
  async getFriendMsgHistory(userId: number, count = 20, messageSeq?: number): Promise<APIResponse> {
    const params: Record<string, unknown> = { user_id: userId, count }
    if (messageSeq !== undefined) params.message_seq = messageSeq
    return this.call('get_friend_msg_history', params)
  }

  /** 转发消息给好友。 */
  async forwardFriendSingleMsg(messageId: number, userId: number): Promise<APIResponse> {
    return this.call('forward_friend_single_msg', { message_id: messageId, user_id: userId })
  }

  /** 转发消息到群。 */
  async forwardGroupSingleMsg(messageId: number, groupId: number): Promise<APIResponse> {
    return this.call('forward_group_single_msg', { message_id: messageId, group_id: groupId })
  }

  /** 设置好友备注。 */
  async setFriendRemark(userId: number, remark: string): Promise<APIResponse> {
    return this.call('set_friend_remark', { user_id: userId, remark })
  }

  /** 设置群备注。 */
  async setGroupRemark(groupId: number, remark: string): Promise<APIResponse> {
    return this.call('set_group_remark', { group_id: groupId, remark })
  }

  /** 群签到。 */
  async setGroupSign(groupId: number): Promise<APIResponse> {
    return this.call('set_group_sign', { group_id: groupId })
  }

  /** 获取群禁言列表。 */
  async getGroupShutList(groupId: number): Promise<APIResponse> {
    return this.call('get_group_shut_list', { group_id: groupId })
  }

  /** 退出机器人。 */
  async botExit(): Promise<APIResponse> {
    return this.call('bot_exit', {})
  }

  /** 设置账号在线状态。 */
  async setOnlineStatus(
    status: number,
    extStatus: number,
    batteryStatus: number,
  ): Promise<APIResponse> {
    return this.call('set_online_status', {
      status,
      ext_status: extStatus,
      battery_status: batteryStatus,
    })
  }

  /** 设置 QQ 头像。 */
  async setQqAvatar(file: string): Promise<APIResponse> {
    return this.call('set_qq_avatar', { file })
  }

  /** 获取 clientkey。 */
  async getClientkey(): Promise<APIResponse> {
    return this.call('get_clientkey', {})
  }

  /** 获取单向好友列表。 */
  async getUnidirectionalFriendList(): Promise<APIResponse> {
    return this.call('get_unidirectional_friend_list', {})
  }

  /** 获取点赞列表。 */
  async getProfileLike(): Promise<APIResponse> {
    return this.call('get_profile_like', {})
  }

  /** 获取消息表情点赞详情。 */
  async fetchEmojiLike(opts: {
    messageId: number
    emojiId: string
    emojiType?: string
    count?: number
  }): Promise<APIResponse> {
    const params: Record<string, unknown> = {
      message_id: opts.messageId,
      emoji_id: opts.emojiId,
    }
    if (opts.emojiType !== undefined) params.emoji_type = opts.emojiType
    if (opts.count !== undefined) params.count = opts.count
    return this.call('fetch_emoji_like', params)
  }

  /** 获取可疑好友添加请求列表。 */
  async getDoubtFriendsAddRequest(): Promise<APIResponse> {
    return this.call('get_doubt_friends_add_request', {})
  }

  /** 处理可疑好友添加请求。 */
  async setDoubtFriendsAddRequest(
    userId: number,
    approve = true,
    remark = '',
  ): Promise<APIResponse> {
    const params: Record<string, unknown> = { user_id: userId, approve }
    if (remark) params.remark = remark
    return this.call('set_doubt_friends_add_request', params)
  }

  /** 发送戳一戳。 */
  async sendPoke(userId: number, groupId?: number): Promise<APIResponse> {
    const params: Record<string, unknown> = { user_id: userId }
    if (groupId !== undefined) params.group_id = groupId
    return this.call('send_poke', params)
  }

  /** 将所有消息标记为已读。 */
  async markAllAsRead(): Promise<APIResponse> {
    return this.call('_mark_all_as_read', {})
  }

  /** 获取最近联系人列表。 */
  async getRecentContact(count = 10): Promise<APIResponse> {
    return this.call('get_recent_contact', { count })
  }

  /** 获取群扩展信息。 */
  async getGroupInfoEx(groupId: number): Promise<APIResponse> {
    return this.call('get_group_info_ex', { group_id: groupId })
  }

  /** 设置群头像。 */
  async setGroupPortrait(groupId: number, file: string): Promise<APIResponse> {
    return this.call('set_group_portrait', { group_id: groupId, file })
  }

  /** 获取被忽略的加群请求列表。 */
  async getGroupIgnoreAddRequest(): Promise<APIResponse> {
    return this.call('get_group_ignore_add_request', {})
  }

  /** 获取被忽略的群通知列表。 */
  async getGroupIgnoredNotifies(): Promise<APIResponse> {
    return this.call('get_group_ignored_notifies', {})
  }

  /** 发送群打卡。 */
  async sendGroupSign(groupId: number): Promise<APIResponse> {
    return this.call('send_group_sign', { group_id: groupId })
  }

  /** 获取好友/群分享 Ark 卡片数据。 */
  async arkSharePeer(opts: {
    userId?: number
    phoneNumber?: string
    groupId?: number
  }): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (opts.userId !== undefined) params.user_id = opts.userId
    if (opts.phoneNumber !== undefined) params.phone_number = opts.phoneNumber
    if (opts.groupId !== undefined) params.group_id = opts.groupId
    return this.call('ArkSharePeer', params)
  }

  /** 获取群分享 Ark 卡片数据。 */
  async arkShareGroup(groupId: number): Promise<APIResponse> {
    return this.call('ArkShareGroup', { group_id: groupId })
  }

  /** 获取小程序 Ark 卡片数据。 */
  async getMiniAppArk(opts: {
    appType: string
    title: string
    desc: string
    picUrl: string
    jumpUrl: string
  }): Promise<APIResponse> {
    return this.call('get_mini_app_ark', {
      type: opts.appType,
      title: opts.title,
      desc: opts.desc,
      pic_url: opts.picUrl,
      jump_url: opts.jumpUrl,
    })
  }

  /** 点击群消息内嵌键盘按钮。 */
  async clickInlineKeyboardButton(opts: {
    groupId: number
    botAppid: string
    buttonId: string
    callbackData: string
    msgSeq: number
  }): Promise<APIResponse> {
    return this.call('click_inline_keyboard_button', {
      group_id: opts.groupId,
      bot_appid: opts.botAppid,
      button_id: opts.buttonId,
      callback_data: opts.callbackData,
      msg_seq: opts.msgSeq,
    })
  }

  /** 创建收藏内容。 */
  async createCollection(rawData: string, brief: string): Promise<APIResponse> {
    return this.call('create_collection', { raw_data: rawData, brief })
  }

  /** 获取收藏列表。 */
  async getCollectionList(opts: { category?: number; count?: number } = {}): Promise<APIResponse> {
    const params: Record<string, unknown> = {}
    if (opts.category !== undefined) params.category = opts.category
    if (opts.count !== undefined) params.count = opts.count
    return this.call('get_collection_list', params)
  }

  /** 获取自定义表情列表。 */
  async fetchCustomFace(count = 48): Promise<APIResponse> {
    return this.call('fetch_custom_face', { count })
  }

  /** 获取机器人 QQ 号段范围。 */
  async getRobotUinRange(): Promise<APIResponse> {
    return this.call('get_robot_uin_range', {})
  }

  /** 发送原始数据包（高级调试用途）。 */
  async sendPacket(cmd: string, body: string): Promise<APIResponse> {
    return this.call('send_packet', { cmd, body })
  }

  /** 获取频道列表。 */
  async getGuildList(): Promise<APIResponse> {
    return this.call('get_guild_list', {})
  }

  /** 获取频道服务资料。 */
  async getGuildServiceProfile(): Promise<APIResponse> {
    return this.call('get_guild_service_profile', {})
  }

  /** 获取账号挂件展示信息。 */
  async getModelShow(): Promise<APIResponse> {
    return this.call('_get_model_show', {})
  }

  /** 设置账号挂件展示。 */
  async setModelShow(model: string, modelShow?: string): Promise<APIResponse> {
    const params: Record<string, unknown> = { model }
    if (modelShow !== undefined) params.model_show = modelShow
    return this.call('_set_model_show', params)
  }
}
