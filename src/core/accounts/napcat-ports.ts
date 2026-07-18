/**
 * napcat SDK Port 接口 + 工厂函数 —— 仓库中唯一允许直接 import napcat 具体 API
 * 类的位置。其余文件一律通过本文件的工厂函数创建实例、通过 Port 接口标注类型，
 * 使 `ClientPool` 之外的消费方不直接依赖 napcat 具体实现，未来接入非 NapCat
 * 协议时只需改动本文件。
 *
 * 接口只声明项目实际调用到的方法（遵循 YAGNI），不照抄 SDK 全部方法列表。
 */
import { MessageApi, GroupApi, FriendApi } from '@aemeath-projects/napcat'
import type { NapCatClient, Result } from '@aemeath-projects/napcat'
import type {
  MessageSegment,
  GroupInfo,
  GroupMember,
  FriendInfo,
} from '@aemeath-projects/napcat/types'

/** 消息相关 API 端口。 */
export interface MessageApiPort {
  sendGroupMsg(groupId: number, message: MessageSegment[]): Promise<Result<{ messageId: number }>>
  sendPrivateMsg(userId: number, message: MessageSegment[]): Promise<Result<{ messageId: number }>>
  deleteMsg(messageId: number): Promise<Result<void>>
}

/** 群相关 API 端口。 */
export interface GroupApiPort {
  getGroupList(): Promise<Result<GroupInfo[]>>
  getGroupMemberList(groupId: number): Promise<Result<GroupMember[]>>
  getGroupMemberInfo(groupId: number, userId: number): Promise<Result<GroupMember>>
  sendGroupSign(groupId: number): Promise<Result<void>>
}

/** 好友相关 API 端口。 */
export interface FriendApiPort {
  getFriendList(): Promise<Result<FriendInfo[]>>
  sendLike(userId: number, times?: number): Promise<Result<void>>
}

/** 构造消息 API 端口实例。 */
export function createMessageApi(client: NapCatClient): MessageApiPort {
  return new MessageApi(client)
}

/** 构造群 API 端口实例。 */
export function createGroupApi(client: NapCatClient): GroupApiPort {
  return new GroupApi(client)
}

/** 构造好友 API 端口实例。 */
export function createFriendApi(client: NapCatClient): FriendApiPort {
  return new FriendApi(client)
}
