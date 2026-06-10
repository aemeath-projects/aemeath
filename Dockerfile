# 阶段 1：构建
FROM node:22-slim AS builder
WORKDIR /app

# 启用 corepack 以使用 pnpm
RUN corepack enable

# 复制工作区配置文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

# 安装全部依赖（含 devDependencies，构建阶段需要）
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建后端 TypeScript（onSuccess 钩子自动拷贝 assets/ → dist/assets/）
RUN pnpm build

# 构建前端
RUN pnpm --filter frontend build

# 裁剪 devDependencies，仅保留生产依赖
RUN pnpm prune --prod

# 阶段 2：运行时
FROM node:22-slim
WORKDIR /app

# 创建非 root 用户
RUN groupadd -g 1000 aemeath && useradd -u 1000 -g aemeath -s /bin/sh -m aemeath

# 从构建阶段复制产物
COPY --from=builder --chown=aemeath:aemeath /app/dist ./dist
COPY --from=builder --chown=aemeath:aemeath /app/prisma/main/generated ./prisma/main/generated
COPY --from=builder --chown=aemeath:aemeath /app/prisma/chat/generated ./prisma/chat/generated
COPY --from=builder --chown=aemeath:aemeath /app/frontend/dist ./frontend/dist
COPY --from=builder --chown=aemeath:aemeath /app/node_modules ./node_modules
COPY --from=builder --chown=aemeath:aemeath /app/package.json ./

# 复制启动脚本
COPY --chown=aemeath:aemeath scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER aemeath

ENV NODE_ENV=production

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["main"]
