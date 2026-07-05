# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

Aemeath 是基于 NapCat / OneBot 11 协议的 QQ 机器人框架，采用 **TypeScript 后端（Node.js + Fastify 5）+ Vue 3 前端**的全栈架构。

## 团队规则（必读）

本项目强制遵守 `.claude/rules/` 下的团队规则，这些规则会自动加载到每次 Claude Code 会话中：

| 规则文件          | 覆盖范围                                   |
| ----------------- | ------------------------------------------ |
| `security.md`     | Secrets 管理、输入校验、注入/XSS/CSRF 防护 |
| `coding-style.md` | 不可变优先、文件组织、错误处理、命名规范   |
| `git-workflow.md` | 提交格式、PR 流程、变更范围控制            |
| `performance.md`  | 查询优化、异步并发、排障节奏               |

任何代码变更都必须符合上述规则。如有冲突，规则文件优先于本文件中的一般性描述。

## 快速开始

```bash
# 1. 复制并配置环境变量
cp .env.example .env
# 编辑 .env，必填项见「关键配置」章节

# 2. 安装依赖
pnpm install

# 3. 生成 Prisma 客户端
pnpm db:generate

# 4. 启动本地中间件（PostgreSQL + Redis + NapCat）
docker-compose -f compose.yaml up -d

# 5. 运行数据库迁移
pnpm db:migrate

# 6. 启动后端（开发模式，自动重载）
pnpm dev

# 7. 启动前端（新终端）
pnpm dev:frontend
```

## 常用命令

### 后端 (Node.js / pnpm)

```bash
pnpm aemeath        # 运行项目内置 CLI 工具（scripts/cli/main.ts）
pnpm dev            # 开发模式（nodemon + tsx，文件变更自动重启）
pnpm dev:worker     # Worker 开发模式（nodemon + tsx，文件变更自动重启）
pnpm build          # TypeScript 编译到 dist/
pnpm start          # 启动生产服务器（需先 build）
pnpm worker         # 启动 BullMQ Worker 进程（独立消费队列任务）
pnpm lint           # ESLint 检查
pnpm lint:fix       # ESLint 检查并自动修复
pnpm format         # Prettier 格式检查（不修改文件）
pnpm format:fix     # Prettier 格式化并写入
pnpm type-check     # tsc --noEmit 类型检查
```

### 数据库 (Prisma)

```bash
# 生成 Prisma 客户端（修改 .prisma 文件后必须执行）
pnpm db:generate

# 生产迁移（deploy 不生成新迁移文件，仅执行已有迁移）
pnpm db:migrate

# 开发迁移（自动检测 schema 变化并生成迁移文件）
pnpm db:migrate:dev:aemeath   # 仅主库
pnpm db:migrate:dev:iris   # 仅 Iris（聊天记录）库
```

### 测试

```bash
pnpm test                    # 全部测试（后端 + 前端，CI 模式）
pnpm test:backend            # 仅后端测试
pnpm test:backend:watch      # 后端测试监听模式
pnpm test:backend:coverage   # 后端测试 + 覆盖率报告
pnpm test:frontend           # 仅前端测试
```

### 前端 (Vue 3 / pnpm)

```bash
pnpm dev:frontend         # 开发服务器（代理 /api 到后端）
pnpm build:frontend       # 类型检查 + 生产构建
cd frontend && pnpm lint          # ESLint + Oxlint
cd frontend && pnpm type-check    # vue-tsc 类型检查
cd frontend && pnpm test          # Vitest 单次运行
cd frontend && pnpm test:watch    # Vitest 监听模式
```

### 本地中间件

```bash
docker-compose -f compose.yaml up -d   # 启动 PostgreSQL + Redis + NapCat
```

### 生产镜像

```bash
docker build -t aemeath:latest .
# 通过环境变量 ROLE 控制启动角色: bot(默认) | worker
# worker 消费 BullMQ 队列任务；主进程通过 BullMQ Job Scheduler 注册定时任务
```

### 快捷命令（Claude Code Slash Commands）

| 命令                | 说明                                          |
| ------------------- | --------------------------------------------- |
| `/aemeath:audit`      | 全量代码审计（bug、性能、规则违反检查）       |
| `/aemeath:bump`       | 版本号更新与打 Tag                            |
| `/aemeath:commit`     | 生成 Conventional Commit 提交信息             |
| `/aemeath:db-migrate` | 数据库迁移工作流（生成 → 检查 → 执行 → 验证） |

## 架构概览

### 技术栈

| 层       | 技术                                  |
| -------- | ------------------------------------- |
| Web 框架 | Fastify 5                             |
| ORM      | Prisma 6                              |
| 任务队列 | BullMQ                                |
| Bot 框架 | @aemeath-projects/exostrider（dispatch/lifecycle/echo/logger） |
| 配置校验 | TypeBox + 自定义 `loadConfig`         |
| 日志     | Pino（via @aemeath-projects/exostrider/logger）|
| LLM      | LangChain (`@langchain/openai`)       |
| 运行时   | Node.js ≥22.12.0                      |
| 包管理   | pnpm 11.6.0                           |
| 测试     | Vitest                                |
| Lint     | ESLint + typescript-eslint + Prettier |

### 双数据库设计（Prisma）

- **主库** (`DATABASE_URL`): 用户、群聊、LLM 配置、管理员、账号（`Account` 模型）等核心业务数据
  - Schema: `prisma/aemeath/schema.prisma`
  - 生成客户端: `prisma/aemeath/generated/`（gitignore，运行 `pnpm db:generate` 生成）
- **Iris 库**（`IRIS_DATABASE_URL`）: 独立 PostgreSQL 存储聊天记录，按月自动分区
  - Schema: `prisma/iris/schema.prisma`
  - 生成客户端: `prisma/iris/generated/`（gitignore，运行 `pnpm db:generate` 生成）
- 修改任意 `.prisma` 文件后必须执行 `pnpm db:generate` 重新生成客户端

### 事件驱动框架 (`src/core/dispatch/`)

核心事件分发采用职责链模式：

- `EventDispatcher` → `CompositeHandlerMapping` → 具体 Mapping 策略
- 内置路由策略：`CommandHandlerMapping`（`/cmd`）、`RegexHandlerMapping`、`KeywordHandlerMapping`、`StartsWith`、`EndsWith`、`FullMatch`、`EventTypeHandlerMapping` 等
- `EchoLoader`（来自 exostrider）根据根目录 `aemeath.config.ts` 配置动态 import 各类型目录，装饰器副作用自动注册组件
- 系统级功能（如 `personnel`）内聚于对应领域包（如 `src/core/personnel/`）
- 拦截器：`LoggingInterceptor`（Pino 结构化日志）、`MetricsInterceptor`（Prometheus）、`SessionInterceptor`（多轮会话）

### Handler 开发约定

新 handler 使用 TC39 class 装饰器注册（从 `@aemeath-projects/exostrider/dispatch` 导入）：

```typescript
import { Handler, OnCommand, OnKeyword, Scope, PermissionDecorator, SettingNode } from '@aemeath-projects/exostrider/dispatch'
import { Inject } from '@aemeath-projects/exostrider/lifecycle'
import type { OneBotContext as Context } from '@/core/dispatch/context.js'
import type { MyService } from '@/services/my-service.js'

@Handler({
  name: 'echo',
  displayName: '回声',
  description: '复读用户消息',
  tags: ['fun'],
})
@SettingNode('enabled', { type: 'boolean', default: true, description: '是否启用回声功能' })
@SettingNode('permission', {
  type: 'enum',
  default: 'ANYONE',
  enumOptions: { ANYONE: 0, GROUP_MEMBER: 10, GROUP_ADMIN: 20, GROUP_OWNER: 30, ADMIN: 100 },
  description: '最低权限等级',
})
class EchoHandler {
  @Inject('my_service')
  private readonly myService!: MyService

  @OnCommand('echo', { aliases: ['回声'] })
  @Scope('group')
  @PermissionDecorator(0)
  async handle(ctx: Context): Promise<void> {
    await ctx.reply(ctx.text)
  }
}
```

- `system: true` 的功能强制启用且不暴露给前端
- 可用路由装饰器：`@OnCommand`、`@OnRegex`、`@OnKeyword`、`@OnStartsWith`、`@OnEndsWith`、`@OnFullMatch`、`@OnEvent`、`@OnNotice`、`@OnRequest`、`@OnMessageSent`、`@OnPoke`、`@OnEssence`、`@OnOffline`
- 交互式多轮会话见 `src/core/session/`

### 生命周期编排（`@aemeath-projects/exostrider/lifecycle`）

新服务使用 TC39 class 装饰器注册启动/关闭逻辑，Bootstrap 类放在 service 文件末尾：

```typescript
import { Service, Inject, Provide, Startup } from '@aemeath-projects/exostrider/lifecycle'

// Service 类定义（纯业务逻辑）...

/* 生命周期注册 */

@Service({ name: 'my_service_bootstrap' })
export class MyServiceBootstrap {
  @Inject('db')
  db!: AemeathPrismaClient

  @Inject('cache')
  cache!: CacheClient

  @Provide('my_service')
  myService!: MyService

  @Startup
  start(): void {
    this.myService = new MyService(this.db, this.cache)
  }
}
```

- `@Service({ name })` — 声明生命周期服务单元
- `@Inject('key')` — 注入基础设施或其他已注册的服务
- `@Provide('key')` — 将实例暴露给其他服务消费
- `@Startup` — 标记初始化方法，由 exostrider `LifecycleOrchestrator` 按依赖图排序调用

基础设施 key（可通过 `@Inject` 注入）：`db`、`iris_db`、`cache`、`persistent`、`cache_redis`、`persistent_redis`、`account_pool`、`message_router`、`group_bot_registry`、`master_apis`、`dispatcher`、`queue`

> ⚠️ 旧的单账号 key（`bot_client`、`msg_api`、`group_api`、`friend_api`、`file_api`、`system_api`、`extension_api`）已随 `src/core/napcat.ts` 移除，详见「多账号连接管理」章节。

业务服务 key（由 `@Provide` 注册后可通过 `@Inject` 使用）：`oss`、`media_storage`、`task_scheduler`、`iris`、`iris_archive`、`iris_search`、`renderer`、`settings`、`settings_checker`、`personnelService` 等

`EchoLoader`（来自 `@aemeath-projects/exostrider/echo`）按 `aemeath.config.ts` 的 `echoes` 配置扫描各目录（默认：`handler→src/handlers`、`service→src/services`、`task→src/tasks`、`route→src/apis`），import 触发副作用自动注册到注册表。

### 依赖注入模式

- Fastify `onReady` 钩子负责服务初始化，`onClose` 负责清理
- 全局实例（`mainDb`、`chatDb`、`cacheClient` 等）挂载到 `app.state`（见 `lifespan.ts` 中的 `AppState` 类型）
- 路由层通过 `req.server.state` 或 Fastify request 装饰器获取依赖

### 分层架构

```
src/
├── core/        # 框架基础设施
│   ├── schemas/     # 共享 TypeBox schemas（common、llm、personnel、response）
│   ├── accounts/    # 多账号路由领域（adapter、bootstrap、context-apis、dedup、group-bot-registry、roles、router）
│   ├── iris/        # 聊天记录领域（archive、exporter、media、s3、search、service、bootstrap）
│   ├── db/          # Prisma 客户端工厂（factory、extensions、guards）
│   ├── dispatch/    # 事件分发适配层（adapter、context、decorators、interceptors、types）
│   ├── lifecycle.ts # AemeathServiceMap 类型声明（服务字典，exostrider ServiceRegistry 泛型参数）
│   ├── llm/         # LLM 领域（api、client、completion、schemas）
│   ├── monitoring/  # Prometheus 指标
│   ├── oss/         # OSS/MinIO 客户端（client、utils、bootstrap）
│   ├── personnel/   # 人员领域（api、events、query、sync）
│   ├── plugins/     # Fastify 插件（auth、cors、swagger）
│   ├── redis/       # Redis 工厂、cacheKeyRegistry、RedisStore、分布式锁
│   ├── session/     # 交互式多轮会话（manager、state-machine、context）
│   ├── settings/    # 设置领域（SettingsService、SettingsPermissionChecker，Startup key: settings）
│   ├── tasks/       # BullMQ broker、TaskExecutor、scheduler、任务模型
│   ├── utils/       # 公共工具（message-builder、enqueue-render）
│   config.ts        # 环境变量校验（TypeBox ConfigSchema）
│   errors.ts        # 业务异常类定义
│   main.ts          # Fastify 应用入口
│   registries.ts    # 注册表聚合导出（handlerRegistry、cacheKeyRegistry 等）
│   worker.ts        # BullMQ Worker 进程入口
├── apis/        # HTTP API 路由（Fastify 路由 + TypeBox schema）
│   ├── plugins/     # Fastify 插件（auth、cors、swagger）
│   ├── schemas/     # 请求/响应 TypeBox schema
│   ├── accounts.ts  # 账号管理 + 多账号路由 API（/api/accounts、/api/routing）
│   ├── iris.ts      # Iris 聊天记录查询 API（/api/iris）
│   └── router.ts    # 路由聚合注册
├── handlers/    # Bot 事件处理器（EchoLoader 自动扫描）
├── renderer/    # Satori + resvg-js 渲染服务（service、templates、fonts、cache-keys）
├── services/    # 功能业务服务（@Service/@Startup 注册）
├── tasks/       # BullMQ 任务处理器（daily-checkin、daily-like、chat-archive、render 等）
├── types/       # 全局类型扩展（fastify.d.ts 等）
aemeath.config.ts    # EchoLoader 扫描路径配置（echoes: handler/service/task/route），routing 多账号路由配置
```

### 核心领域包 (`src/core/<domain>/`)

**`src/core/schemas/`** — 共享 TypeBox Schema

| 文件           | 职责                                       |
| -------------- | ------------------------------------------ |
| `common.ts`    | 通用分页、ID 等基础 schema                 |
| `llm.ts`       | LLM 配置相关请求/响应 schema               |
| `personnel.ts` | 人员查询相关 schema                        |
| `response.ts`  | 统一响应格式 TypeBox schema（`ok`/`fail`） |
| `index.ts`     | 统一导出入口                               |

**`src/core/iris/`** — 聊天记录领域（原 `chat/`，已重命名为 Iris）

| 文件          | 职责                                     |
| ------------- | ---------------------------------------- |
| `service.ts`  | `IrisService`：聊天记录存储、查询（Startup key: `iris`）|
| `archive.ts`  | `IrisArchiveService`：按月分区、S3 归档（Startup key: `iris_archive`）|
| `exporter.ts` | `IrisExporter`：Parquet 流式导出         |
| `search.ts`   | `IrisSearchService`：归档消息搜索（Startup key: `iris_search`）|
| `media.ts`    | `MediaStorageService`：媒体下载持久化到 OSS，SHA-256 去重（Startup key: `media_storage`）|
| `s3.ts`       | `IrisS3`：S3 归档上传                    |
| `bootstrap.ts`| `IrisBootstrap`：生命周期注册入口        |

**`src/core/accounts/`** — 多账号路由领域（替代原 `napcat.ts` 单账号接入）

| 文件                     | 职责                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `bootstrap.ts`           | `MultiAccountBootstrap`：加载数据库账号、创建 `ClientPool`、路由表、健康检测（Startup key: `account_pool`、`message_router`、`group_bot_registry`、`master_apis`）|
| `adapter.ts`             | `NapCatClientAdapter`：将 `NapCatClient` 适配进 `ClientPool`  |
| `router.ts`              | `MessageRouter`：基于 `RoutingTable` + `PriorityStickyStrategy` 做消息路由/负载均衡 |
| `group-bot-registry.ts`  | `GroupBotRegistry`：维护各账号在各群内的角色（member/admin）  |
| `context-apis.ts`        | `buildContextApis()`：为事件上下文构建 `msgApi`/`groupApi`/`friendApi`（`msgApi.sendGroupMsg` 委托给 `MessageRouter`）|
| `dedup.ts`               | `OneBotDedupKeyExtractor`：多账号收到同一事件时的去重         |
| `roles.ts`               | `AccountRole`/`PriorityMode` 定义与 `getRolesForMode()`       |

**`src/core/oss/`** — OSS/MinIO 客户端

| 文件            | 职责                                               |
| --------------- | -------------------------------------------------- |
| `client.ts`     | `createOssClient()`：解析 `S3_ENDPOINT_URL` 创建 MinIO Client |
| `utils.ts`      | `uploadBuffer`/`downloadBuffer`/`objectExists`/`deleteObject` |
| `bootstrap.ts`  | Startup 注册（key: `oss`）：初始化客户端并确保 bucket 存在 |

**`src/core/redis/`** — Redis 基础设施

| 文件            | 职责                                               |
| --------------- | -------------------------------------------------- |
| `factory.ts`    | `createRedis()`/`createBullMQConnection()`         |
| `registry.ts`   | `cacheKeyRegistry`：全局 cache key 定义注册表      |
| `store.ts`      | `RedisStore`：通用 Redis KV 存储封装               |
| `lock.ts`       | `RedisLock`：分布式锁                              |



**`src/core/llm/`** — LLM 领域

| 文件            | 职责                                         |
| --------------- | -------------------------------------------- |
| `client.ts`     | `LLMClient`：LangChain OpenAI 兼容客户端封装 |
| `completion.ts` | `llmComplete`/`llmStream`：高层 LLM 调用接口 |
| `api.ts`        | Fastify 路由：LLM 提供商/模型 CRUD           |

**`src/core/personnel/`** — 人员领域

| 文件        | 职责                                                      |
| ----------- | --------------------------------------------------------- |
| `main.ts`   | `PersonnelService`：用户/群聊写操作（upsert、管理员管理） |
| `query.ts`  | `PersonnelQueryService`：用户/群聊只读查询                |
| `events.ts` | `PersonnelEventsService`：好友/群成员增量事件处理         |
| `sync.ts`   | `SyncCoordinator`：定时从 NapCat 同步用户数据             |
| `api.ts`    | Fastify 路由：人员查询 API                                |

### 功能业务服务层 (`src/services/`)

| 文件               | 服务                  | 职责                                              |
| ------------------ | --------------------- | ------------------------------------------------- |
| `feedback.ts`      | `FeedbackService`     | 用户反馈创建、查询、状态更新                      |
| `jrlp.ts`          | `JrlpService`         | 今日老婆随机抽取与记录                            |
| `like.ts`          | `LikeService`         | 点赞（手动/定时任务注册/取消）                    |
| `daily-checkin.ts` | `DailyCheckinService` | 群签到（定时触发，RPC 桥接）                      |
| `checkin.ts`       | `CheckinService`      | 群签到业务逻辑（积分、排行、汇总）                |
| `drift-bottle.ts`  | `DriftBottleService`  | 漂流瓶（扔/捞、多池管理）                         |

> 注：定时任务调度器已迁移至 `src/core/tasks/scheduler.ts`（Startup key: `task_scheduler`），负责注册四条 BullMQ 定时任务（签到、点赞、归档、分区预建）。

### 异步任务（BullMQ）

BullMQ（任务队列）取代原有的 Dramatiq。Worker 进程运行在 `src/core/worker.ts`，通过 RPC 桥接调用主进程业务服务。

**BullMQ 队列名称（`src/core/tasks/broker.ts`）：**

| 队列                | 任务             |
| ------------------- | ---------------- |
| `daily_checkin`     | 零点群签到       |
| `daily_like`        | 批量定时点赞     |
| `chat_archive`      | 聊天记录按月归档 |
| `ensure_partitions` | 聊天库分区预创建 |

**主进程 TaskExecutor（`src/core/tasks/executor.ts`）：** Worker 进程直接携带 DB/cache 依赖运行 processor 函数，返回 `BotActionJobResult`；主进程的 `TaskExecutor` 监听 BullMQ QueueEvents 的 `completed` 事件，按白名单调用 Bot API（如 `sendGroupMsg`）。新增需要 Bot API 的任务，在 processor 返回值中声明动作，而非直接在 Worker 进程中调用 Bot API。

### 多账号连接管理 (`src/core/accounts/`)

每个 NapCat 账号主动反向 WebSocket 连接 Aemeath。`@aemeath-projects/napcat` SDK 的 `ReverseWebSocketTransport` 负责侦听与连接管理，`NapCatClient` 代理 Transport 并提供类型安全事件分发；`NapCatClientAdapter` 将其适配进 `@aemeath-projects/exostrider/pool` 的 `ClientPool`。

`MultiAccountBootstrap`（替代原 `BotClientBootstrap`/`napcat.ts`）启动时从主库 `Account` 表加载所有 `isEnabled` 账号，为每个账号创建 adapter 并加入 `ClientPool`，随后构建 `RoutingTable`（`PriorityStickyStrategy` 策略）与 `MessageRouter`，并同步各账号在各群内的角色到 `GroupBotRegistry`。

`ctx.apis`（由 `buildContextApis()` 构建）中的 `msgApi` 是一个 Proxy，`sendGroupMsg` 等方法被委托给 `MessageRouter`，由其在多个在线账号间按优先级/粘性策略选路，实现消息发送的负载均衡与故障转移；`groupApi`/`friendApi` 直接绑定事件来源账号的客户端。需要固定使用主账号 API 的场景（如部分定时任务）可注入 `master_apis`（`MasterApis`：`msgApi`/`groupApi`/`friendApi`，无主账号时为 `null`）。

路由行为可通过 `aemeath.config.ts` 的 `routing` 配置块调整：`defaultPriorityMode`（`prefer_master` | `prefer_normal`）、`healthCheckIntervalMs`、`dedupWindowMs`。账号管理与路由状态的 REST API 见 `src/apis/accounts.ts`（`/api/accounts`、`/api/routing`）。

> ⚠️ 业务代码（`src/handlers`、`src/services`、`src/tasks`）已全量迁移，不再存在 `@Inject('bot_client' | 'msg_api' | 'group_api' | 'friend_api' | 'file_api' | 'system_api' | 'extension_api')` 这类旧的单账号注入点。

### 前端架构

- **Pinia** 分模块状态管理（`stores/`），`pinia-plugin-persistedstate` 做 localStorage 持久化
- **API 层** (`apis/`) 封装所有 HTTP 请求，通过 Axios + Vite 代理访问后端
- **Vuetify 4** 作为 UI 框架，路由见 `frontend/src/router/index.ts`

## 关键配置

> ⚠️ 环境变量以 `src/core/config.ts` 中的 `ConfigSchema` 为准。

**必填环境变量：**

| 变量                  | 说明                                                         |
| --------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`        | 主库 PostgreSQL URL（`postgresql://user:pass@host:5432/db`） |
| `IRIS_DATABASE_URL`   | Iris（聊天记录）库 PostgreSQL URL（格式同上）                |
| `BULLMQ_REDIS_URL`    | BullMQ 任务队列 Redis URL（`redis://host:6379`）             |
| `CACHE_REDIS_URL`     | 缓存 Redis URL                                               |

> ⚠️ `compose.yaml` 启动两个 Redis 实例：**持久化** 绑定 `6379`，**缓存** 绑定 `6380`。本地开发时 `BULLMQ_REDIS_URL`/`PERSISTENT_REDIS_URL` 指向 6379，`CACHE_REDIS_URL` 指向 6380。
>
> ⚠️ 多账号迁移后，`NAPCAT_ACCESS_TOKEN`/`NAPCAT_WS_PORT` 环境变量已废弃并从 `ConfigSchema` 移除。账号凭据（`qq`、`role`、`transport`、`endpoint`、`token`）现存储在主库 `accounts` 表（Prisma `Account` 模型），通过 `/api/accounts` REST API 或直接写库管理，`MultiAccountBootstrap` 启动时读取。

**选填（有默认值）：**

| 变量                   | 默认值               | 说明                                   |
| ---------------------- | -------------------- | -------------------------------------- |
| `PERSISTENT_REDIS_URL` | 同 `CACHE_REDIS_URL` | 持久化存储 Redis（空则回退）           |
| `NODE_ENV`             | `development`        | `development` \| `production`          |
| `PORT`                 | `8000`               | 服务监听端口                           |
| `LOG_LEVEL`            | `info`               | `debug` \| `info` \| `warn` \| `error` |
| `LOG_FORMAT`           | `json`               | `json` \| `console`                    |
| `FRONTEND_DIST_DIR`    | `frontend/dist`      | 前端静态文件目录                       |
| `ADMIN_TOKEN`          | `''`（空）           | 管理后台 Bearer token，**为空则跳过认证**（仅开发环境使用） |
| `S3_ENDPOINT_URL`      | `''`（空）           | MinIO/S3 endpoint，**为空则禁用 OSS/归档/媒体存储功能** |
| `S3_ACCESS_KEY_ID`     | `''`（空）           | S3 访问密钥 ID                         |
| `S3_SECRET_ACCESS_KEY` | `''`（空）           | S3 访问密钥                            |
| `S3_REGION`            | `us-east-1`         | S3 区域                                |
| `S3_IRIS_BUCKET`       | `aemeath-iris`      | 聊天归档 bucket                        |
| `S3_MEDIA_BUCKET`      | `aemeath-media`     | 媒体存储 bucket                        |
| `S3_RENDER_BUCKET`     | `aemeath-render`    | 渲染结果 bucket                        |
| `RENDER_CACHE_TTL`     | （见 config.ts）    | 渲染结果缓存 TTL（秒）                 |

配置校验逻辑：`src/core/config.ts` → `loadConfig()` 函数。

## 运行时配置（`aemeath.config.ts`）

根目录 `aemeath.config.ts` 控制框架运行时行为，修改后重启生效：

| 参数 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `app.commandPrefix` | `/` | Bot 命令触发前缀 |
| `app.sessionTimeout` | `300`（秒） | 交互式多轮会话超时时长 |
| `app.defaultTimezone` | `Asia/Shanghai` | 定时任务时区 |
| `app.cacheKeyPrefix` | `aemeath:` | Redis cache key 命名空间前缀 |
| `app.queueName` | `aemeath-tasks` | BullMQ 主任务队列名称 |
| `app.heartbeatKeyPrefix` | `aemeath:worker:heartbeat` | Worker 心跳 Redis key 前缀 |
| `routing.defaultPriorityMode` | `prefer_master` | 多账号路由优先级模式：`prefer_master` \| `prefer_normal` |
| `routing.healthCheckIntervalMs` | `30000` | `ClientPool` 健康检查间隔（毫秒） |
| `routing.dedupWindowMs` | `5000` | 多账号事件去重窗口（毫秒） |
| `echoes.*` | 见文件 | EchoLoader 扫描目录（handler/service/task/route） |

## 代码风格

> 详细规则见 `.claude/rules/coding-style.md`（自动加载）。以下为工具链配置摘要：

- TypeScript 严格模式（`strict: true`），目标 `ESNext`，模块系统 `ESM`
- 所有 `.ts` 导入必须带 `.js` 后缀（Node ESM 兼容）：`import { foo } from './foo.js'`
- 类型专用导入使用 `import type`：`import type { Foo } from './foo.js'`
- ESLint + typescript-eslint 强制执行，Prettier 负责格式化
- 注释使用中文，保持代码库语言统一
- 行长限制由 Prettier `printWidth: 100` 控制

## API 约定

- 统一响应格式 `{code: 0, data, message}` / `{code: -1, data, message}`，使用 `src/core/response.ts` 的 `ok()` / `fail()`
- 后端路由 `src/apis/<module>.ts` 与前端 `frontend/src/apis/<module>.ts` 一一对应（目录名为 `apis`）
- 核心层 API 路由随领域包内聚：`src/core/llm/api.ts`、`src/core/personnel/api.ts`
- 前端 API 层统一通过 `frontend/src/apis/client.ts` 的 Axios 实例发请求
- `src/apis/logs.ts`：SSE 实时日志推送（`GET /logs/stream`）
- `src/apis/queue.ts`：BullMQ 队列监控（`GET /queue/*`，含 Worker 信息、定时任务、SSE 实时推送）
- 系统端点：`GET /health`（健康检查）、`GET /metrics`（Prometheus 指标）

## 测试

### 后端 (Vitest)

```bash
pnpm test:backend                  # 单次运行
pnpm test:backend:watch            # 监听模式
pnpm test:backend:coverage         # 覆盖率报告

# 运行单个测试文件
pnpm vitest run --project backend tests/unit/core/config.test.ts
```

测试分布：`tests/unit/`（单元测试）、`tests/integration/`（集成测试）。Vitest 项目配置见 `vitest.config.ts`（`backend` 项目对应后端测试）。

### 前端 (Vitest)

```bash
cd frontend
pnpm test        # 单次运行（CI 模式）
pnpm test:watch  # 监听模式
```

前端测试位于 `frontend/tests/`（按 `composables/`、`utils/`、`stores/` 分类）。
