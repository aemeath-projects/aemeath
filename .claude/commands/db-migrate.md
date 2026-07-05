# /aemeath:db-migrate — 数据库迁移工作流

管理双数据库（主库 + Iris 聊天记录库）的 Prisma 迁移。

## 数据库说明

| 库                    | 目标标识  | Schema 文件                    | 迁移文件位置                 |
| --------------------- | --------- | ------------------------------- | ---------------------------- |
| 主库（核心业务）      | `aemeath` | `prisma/aemeath/schema.prisma` | `prisma/aemeath/migrations/` |
| Iris 库（聊天记录）   | `iris`    | `prisma/iris/schema.prisma`    | `prisma/iris/migrations/`    |

## 常用操作

### 生成 Prisma 客户端（修改 schema 后必须执行）

```bash
pnpm db:generate
```

### 查看待执行迁移

```bash
# 开发环境——交互式，可自动检测 schema 变化
pnpm db:migrate:dev:aemeath   # 主库
pnpm db:migrate:dev:iris      # Iris 聊天记录库

# 生产环境——仅执行已有迁移文件，不生成新文件
pnpm db:migrate            # 同时升级两库
```

### 回退迁移

Prisma 不提供内置 downgrade 命令，需手动执行迁移文件中的回滚 SQL 或恢复数据库快照。
重要变更上线前必须在 PR 描述中附带回滚方案。

## 标准工作流（Schema 变更）

1. 修改 `prisma/aemeath/schema.prisma` 或 `prisma/iris/schema.prisma`
2. 生成并检查迁移文件：
   ```bash
   pnpm db:migrate:dev:aemeath   # 或 :iris
   # ↑ 交互式提示输入迁移名称，如 "add_user_nickname"
   ```
3. **人工检查生成的迁移文件**（`prisma/aemeath/migrations/<timestamp>_<name>/migration.sql`）
   - 确认无意外的 DROP TABLE / DROP COLUMN
   - Iris 库月分区表变更需手动补充分区相关 DDL（Prisma 不感知分区）
4. 重新生成客户端（若 schema 有变动）：
   ```bash
   pnpm db:generate
   ```
5. 验证迁移已应用：
   ```bash
   # 查看 _prisma_migrations 表中最新记录
   pnpm db:migrate:dev:aemeath   # 无待执行迁移时会提示 "Already in sync"
   ```

## 注意事项

- 修改任意 `.prisma` 文件后**必须**执行 `pnpm db:generate` 重新生成客户端，否则类型不一致
- Iris 库按月自动分区，`prisma migrate dev` 检测不到分区定义，分区相关变更需手动添加到迁移 SQL
- 生产部署使用 `pnpm db:migrate`（`migrate deploy`），不会生成新迁移文件，只执行已有文件
