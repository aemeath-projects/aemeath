/**
 * NapCat SDK 客户端启动注册 —— ReverseWebSocketTransport + 6 个 API 模块。
 *
 * EchoLoader 不扫描 src/core/，由 main.ts 手动 import 触发副作用。
 */

import { Service, Provide, Startup, Shutdown } from '@aemeath-projects/exostrider/lifecycle'
import { getLogger } from '@aemeath-projects/exostrider/logger'
import type { PinoLogger } from '@aemeath-projects/exostrider/logger'
import {
  NapCatClient,
  ReverseWebSocketTransport,
  MessageApi,
  GroupApi,
  FriendApi,
  FileApi,
  SystemApi,
  ExtensionApi,
} from '@aemeath-projects/napcat'

import { loadConfig } from './config.js'

const log: PinoLogger = getLogger('napcat') as unknown as PinoLogger

@Service({ name: 'bot_client_bootstrap' })
export class BotClientBootstrap {
  /** NapCat 主客户端，暴露为 'bot_client' 键。 */
  @Provide('bot_client')
  botClient!: NapCatClient

  /** 消息 API，暴露为 'msg_api' 键。 */
  @Provide('msg_api')
  msgApi!: MessageApi

  /** 群组 API，暴露为 'group_api' 键。 */
  @Provide('group_api')
  groupApi!: GroupApi

  /** 好友 API，暴露为 'friend_api' 键。 */
  @Provide('friend_api')
  friendApi!: FriendApi

  /** 文件 API，暴露为 'file_api' 键。 */
  @Provide('file_api')
  fileApi!: FileApi

  /** 系统 API，暴露为 'system_api' 键。 */
  @Provide('system_api')
  systemApi!: SystemApi

  /** 扩展 API，暴露为 'extension_api' 键。 */
  @Provide('extension_api')
  extensionApi!: ExtensionApi

  @Startup
  async start(): Promise<void> {
    const config = loadConfig()

    const transport = new ReverseWebSocketTransport({
      host: '0.0.0.0',
      port: config.NAPCAT_WS_PORT,
      path: '/',
      token: config.NAPCAT_ACCESS_TOKEN,
      maxConnections: 1,
    })

    const client = new NapCatClient(transport)

    this.botClient = client
    this.msgApi = new MessageApi(client)
    this.groupApi = new GroupApi(client)
    this.friendApi = new FriendApi(client)
    this.fileApi = new FileApi(client)
    this.systemApi = new SystemApi(client)
    this.extensionApi = new ExtensionApi(client)

    await client.connect()

    log.info(`NapCat 反向 WebSocket 服务器已启动，port=${String(config.NAPCAT_WS_PORT)}`)
  }

  @Shutdown
  async stop(): Promise<void> {
    await this.botClient.disconnect()
    log.info('NapCat 客户端已断开连接')
  }
}
