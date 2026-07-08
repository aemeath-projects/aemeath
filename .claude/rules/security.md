# 安全规则（强制执行）

本规则适用于所有代码变更，违反任何一条均为阻断性问题。

## Secrets 管理

- **禁止**在代码中硬编码任何密钥、token、密码、API key（包括测试代码）
- 所有凭据必须通过环境变量或 `.env` 文件注入，统一通过 `src/core/config.ts` 的 `loadConfig()` 读取
- `.env`、`*.key`、`*_secret*` 文件必须列入 `.gitignore`，**绝不允许**提交到版本库
- 日志输出禁止打印 secrets 字段（Pino 通过 `redact` 配置过滤）

## 输入校验

- 所有外部输入的信任边界：**API 请求体**、**WebSocket 消息**、**URL 参数/路径参数**、**Query 参数**
- 后端：必须使用 **TypeBox schema**（`@sinclair/typebox`）或 Fastify 内置类型校验，不得使用裸 `unknown`/`any` 直接使用
- 前端：用户输入在提交前必须经过客户端基础校验，但后端校验是最终防线
- 禁止信任 `Content-Length`、`X-Forwarded-For` 等可伪造的请求头进行授权判断

## SQL 注入

- **禁止**使用字符串拼接构造数据库查询
- 必须使用 **Prisma ORM** 的类型安全 API（`prisma.user.findMany({ where: { ... } })`）
- 如需原始 SQL，使用 Prisma 的 `$queryRaw` 并通过模板字面量参数化：``prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}` ``

## XSS 防护

- 前端（Vue 3）：**禁止**将用户提供的内容绑定到 `v-html`；如必须渲染富文本，使用经过白名单过滤的库
- 后端 API 返回的用户生成内容不应假设前端会转义，确保不含危险的内联脚本注入点
- HTTP 响应头通过 Fastify 中间件统一注入 `Content-Security-Policy`

## CSRF 防护

- 本项目 API 无需 HTTP 级别鉴权，无 CSRF 攻击面
- 确保 `src/apis/plugins/cors.ts` 中 CORS 白名单不包含通配符 `*`（除非是纯公开接口）
- WebSocket 握手必须校验 `NAPCAT_ACCESS_TOKEN`，拒绝无令牌连接（见 `src/core/bot-client.ts`）

## 依赖安全

- 新增第三方依赖前，检查 [npm advisories](https://www.npmjs.com/advisories) 或运行 `pnpm audit`
- **禁止**使用 `eval()`、`Function()` 构造器、`vm.runInNewContext()` 处理任何来自外部的不可信数据
- 禁止在生产镜像中安装 devDependencies（`pnpm install --prod`）
