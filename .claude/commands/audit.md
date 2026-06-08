# /aemeath:audit — 全量代码审计

对 codebase 进行全面分析，找出潜在 bug、性能问题和违反项目规则的代码。

**用法：**

- `/aemeath:audit` — 全栈审计（默认）
- `/aemeath:audit backend` — 仅审计 TypeScript 后端
- `/aemeath:audit frontend` — 仅审计 Vue 前端

当前范围：$ARGUMENTS（为空则默认 `all`）

## 审计维度

### 后端审计（`backend` 或 `all`）

扫描 `src/` 目录，逐模块检查：

**安全问题（Critical）**

- 硬编码的 secrets、token、密码、API key（违反 `security.md`）
- SQL 注入：字符串拼接传入 `$queryRaw`（应使用模板字面量参数化）
- `eval()`、`Function()` 构造器、`vm.runInNewContext()` 处理外部数据
- API 路由接受裸 `unknown` 或 `any` 而非 TypeBox schema
- CORS 白名单含通配符 `*`

**性能反模式（Warning）**

- N+1 查询：循环内执行 `prisma.<model>.findMany()` / `findUnique()`（应使用 `include` 预加载）
- 批量操作未使用 `createMany` / `updateMany`（循环内单条 insert/update）
- 并发独立 I/O 串行 `await`（应使用 `Promise.all()`）
- 无分页的大表查询（缺少 `take`/`skip` 或 cursor 参数）
- 聊天库查询未携带 `createdAt` 时间范围（导致全表扫描，跨分区）

**代码质量（Warning）**

- 裸 `catch (e)` 后静默吞错（无 `logger.error` 或 Pino 日志）
- `throw new Error('...')` 而非 `src/core/errors.ts` 中的自定义异常类
- API 响应未通过 `ok()` / `fail()`（`src/core/utils/response.ts`）包装
- 违反分层架构：API 路由直接调用 Prisma 客户端、Service 层导入 `FastifyRequest`/`FastifyReply`
- `void somePromise()` 忽略 Promise 拒绝（无明确意图注释时）

**规则违反（Info）**

- `process.env.FOO` 散落在业务代码中（应通过 `loadConfig()` 集中读取）
- 模块首行缺少中文 JSDoc 说明（`/** 模块描述。 */`）
- 导入缺少 `.js` 后缀（Node ESM 要求）
- 类型专用导入未使用 `import type`

### 前端审计（`frontend` 或 `all`）

扫描 `frontend/src/` 目录：

**安全问题（Critical）**

- `v-html` 绑定用户输入（XSS 风险）
- `localStorage` 存储敏感数据（token 等）

**代码质量（Warning）**

- API 调用无 loading/error 状态处理
- 滥用 `any` 类型（非必要的 TypeScript `any`）
- Store 中未捕获的异步异常
- 组件超过 300 行（建议拆分）

**规则违反（Info）**

- `console.log` 遗留调试输出
- 未使用的 import 或变量（参考 ESLint 结果）

## 输出格式

```
## 审计报告 — [范围] — [日期]

### 🔴 Critical（X 项）
| 文件 | 行号 | 问题 | 建议修复 |
|------|------|------|---------|
| ... | ... | ... | ... |

### 🟡 Warning（X 项）
...

### 🔵 Info（X 项）
...

### ✅ 未发现问题的模块
- src/core/framework/
- ...

---
总计：X Critical / X Warning / X Info
建议优先修复 Critical 项，其余可在独立 commit 中处理。
```

## 执行后行动

报告生成后，询问用户是否需要：

1. **逐项修复** — 从 Critical 开始，每次修复一个问题
2. **生成修复清单** — 保存为待办事项，分批处理
3. **仅查阅** — 不立即修改代码
