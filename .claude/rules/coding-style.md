# 编码风格规则（强制执行）

补充 CLAUDE.md 中的格式化配置，约定代码组织和质量底线。项目已用 TypeScript 重构，以下规则均针对 TypeScript/Node.js。

## 不可变优先

- 优先使用 `readonly` 修饰数组/对象成员：`readonly items: string[]`
- 函数参数**禁止**可变默认引用类型，用 `= []` 或 `= {}` 的对象/数组字面量默认值是安全的（JS 每次调用都新建）
- 模块级常量使用 `as const`：`const BASE_URL = 'https://...' as const`
- 纯数据对象使用 `Object.freeze()` 或 `readonly` 接口
- 配置对象通过 `loadConfig()` 返回冻结的 `Config` 对象，禁止在运行时修改

## 文件组织（分层架构）

遵循现有 Spring-like 分层，新文件必须放在正确的层：

| 层            | 目录                          | 放什么                                                    |
| ------------- | ----------------------------- | --------------------------------------------------------- |
| 基础设施      | `src/core/`                   | 框架、协议、DB 客户端、缓存、工具函数                     |
| API 控制器    | `src/apis/`                   | Fastify 路由，只做请求解析和响应组装                      |
| 业务逻辑      | `src/services/`               | 所有业务规则，可被 API 和 Handler 复用                    |
| Prisma Schema | `prisma/aemeath/` `prisma/iris/` | 数据库表定义（`schema.prisma`）；迁移文件与 schema 同目录 |
| Bot 处理器    | `src/handlers/`               | 事件处理，调用 Service，不直接操作 DB                     |
| 异步任务      | `src/tasks/`                  | BullMQ 任务处理器，调用 Service                           |

- API 路由**禁止**直接导入 Prisma 生成的客户端或执行数据库查询，必须经过 Service 层
- Service 层**禁止**导入 Fastify 相关模块（`FastifyRequest`、`FastifyReply` 等）

## 错误处理

- 业务异常使用 `src/core/errors.ts` 中定义的异常类，**禁止**直接 `throw new Error('...')`
- **禁止裸 `catch (e)`** 后什么都不做（静默吞错）；需要兜底时记录 `app.log.error` 或 Pino logger
- API 层所有响应必须通过 `src/core/response.ts` 的 `ok()` / `fail()` 包装
- Promise 拒绝必须被 `await` 捕获或通过 `.catch()` 处理；**禁止** `void somePromise()` 忽略错误（仅在确认不需要等待结果时允许）

## 输入校验

- Fastify 路由的请求体必须有对应的 **TypeBox schema**（`@sinclair/typebox`），不接受裸 `unknown` 或 `any`
- 请求参数 schema 定义放在 `src/apis/schemas/<module>.ts`
- 环境变量统一由 `src/core/config.ts` 的 `loadConfig()` 校验，**禁止** `process.env.FOO` 散落在业务代码中

## 命名规范

## 命名规范

### 全栈命名规则速查

| 层                     | 规则                       | 正确示例                                              | 错误示例                                  |
| ---------------------- | -------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| 数据库表/列/枚举       | `snake_case`               | `chat_messages`, `group_id`, `like_source`            | `ChatMessage`, `groupId`, `likesource`    |
| Redis key              | `snake_case`（段间 `:` 分隔） | `aemeath:personnel:sync_status`, `aemeath:render:result` | `aemeath:personnel:syncStatus`        |
| API 端点路由           | `kebab-case`               | `/api/chat-history`, `/api/drift-bottle-pools`        | `/api/chatHistory`, `/api/drift_bottle`   |
| TypeScript 变量/函数   | `camelCase`                | `groupId`, `userName`, `fetchGroups()`                | `group_id`, `user_name`, `fetch_groups()` |
| 类/接口/类型           | `PascalCase`               | `UserDetail`, `ChatMessageSchema`                     | `userDetail`, `chat_message_schema`       |
| 常量                   | `UPPER_SNAKE_CASE`         | `MAX_RETRY_COUNT`, `BASE_URL`                         | `maxRetryCount`, `baseUrl`                |
| API 请求体/响应 data   | `camelCase`                | `{ "taskId": "...", "groupName": "..." }`             | `{ "task_id": "...", "group_name": "..." }` |
| API 响应 `message`     | 自由文本（可含空格）       | `"Archive task queued"`, `"同步已触发"`               | —                                         |
| Vue 组件 props/模板    | `camelCase`                | `:groupName`, `v-model:isActive`                      | `:group_name`, `v-model:is_active`        |
| OneBot 协议字段        | SDK 暴露 camelCase         | 字段名 camelCase；仅协议字面量值（如 `'friend_add'`）保持 snake | —                                  |

### 各层详细约定

- **数据库**：Prisma 模型字段使用 `camelCase`，通过 `@map` / `@@map` 映射到数据库的 `snake_case`。枚举 `@@map` 名称同样使用 `snake_case`
- **Redis key**：遵循与数据库相同的 `snake_case` 命名，段间用 `:` 分隔，参数占位符用 `${}` 包裹。示例：`aemeath:checkin:${groupId}:${dateStr}`；通过 `CacheKeyRegistry` 统一注册
- **API 端点路由**：URL 路径段全部小写 + 连字符（`kebab-case`），不使用下划线或驼峰
- **TypeScript**：变量/函数 `camelCase`，类/接口/类型 `PascalCase`，常量 `UPPER_SNAKE_CASE`，私有成员 `_prefix` 或 TypeScript `private`
- **Prisma 模型字段**：`camelCase`（通过 `@map` 映射到数据库 `snake_case`）。后端查询结果序列化为 JSON 时直接使用 Prisma 字段名，即 `camelCase`
- **API 请求体 / 响应 data 字段**：一律 `camelCase`，由 TypeBox schema 强制校验。**禁止**在 REST API 的请求/响应 JSON 中出现 `snake_case` 键名
- **API 响应 `message`**：自由文本，可包含空格和中英文，用于前端直接展示
- **Handler 装饰器**：`@Handler`、`@OnCommand`、`@OnKeyword` 等均为 **PascalCase**
- **Vue 组件**：文件名 `PascalCase.vue`，组件内变量/props/模板绑定均遵循 `camelCase`

## 路径别名（后端强制）

后端代码引用 `src/` 目录下的文件**必须**使用路径别名，禁止使用相对路径（`../../../`）跨层引用：

| 别名        | 指向                          | 用途                                |
| ----------- | ----------------------------- | ----------------------------------- |
| `@/*`       | `src/*`                       | `src/` 下所有模块的通用别名        |
| `@logger`   | `src/core/logging/index.js`   | Pino logger，**必须**使用此别名    |
| `#prisma/*` | `prisma/*/generated/index.js` | Prisma 生成客户端，**必须**使用此别名 |

示例：

```typescript
// ✅ 正确
import { logger } from '@logger'
import { aemeathDb } from '#prisma/aemeath'
import { someUtil } from '@/core/utils/helpers.js'

// ❌ 禁止
import { logger } from '../../../core/logging/index.js'
import { aemeathDb } from '../../../prisma/aemeath/generated/index.js'
```

- 同一文件内的相对导入（同目录或相邻目录）仍允许使用相对路径
- 别名配置维护在 `tsconfig.json` 的 `paths` 字段中，确保与实际目录结构一致

## 导入规范

- 所有 `.ts` 模块导入**必须**使用 `.js` 后缀（Node ESM 要求）：`import { foo } from './foo.js'`
- 仅用于类型的导入必须使用 `import type`：`import type { Bar } from './bar.js'`
- 禁止循环依赖；如有需要，通过依赖注入（`app.state` 或构造函数传参）解耦
- 导入顺序：Node 内建（`node:`前缀）→ 第三方库 → 项目内部（ESLint `import-x` 规则自动排序）

## 注释与文档

- 模块首行应有中文 JSDoc 说明：`/** 模块描述。 */`
- 公共类、方法建议添加中文 JSDoc 说明用途和关键参数
- 内联注释使用中文，保持代码库语言统一
- 禁止提交 TODO/FIXME 注释，未完成的工作应开 Issue 追踪
