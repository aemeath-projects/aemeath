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

# 构建后端 TypeScript
RUN pnpm build

# 构建前端
RUN pnpm --filter frontend build

# 安装 Playwright Chromium（仅 headless-shell，体积更小）
# 项目仅用 headless=True 渲染，chromium-headless-shell 完全满足需求
RUN pnpm exec playwright install chromium --with-deps

# 裁剪 devDependencies，仅保留生产依赖
RUN pnpm prune --prod

# 阶段 2：运行时
FROM node:22-slim
WORKDIR /app

# 消除 apt 交互式 debconf 警告
ENV DEBIAN_FRONTEND=noninteractive

# 安装 Chromium 运行时系统库 + CJK 字体
# fonts-noto-cjk：Noto CJK SC 字体，HTML 模板中优先级高于 playwright 自带字体
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN groupadd -g 1000 aemeath && useradd -u 1000 -g aemeath -s /bin/sh -m aemeath

# 从构建阶段复制产物
COPY --from=builder --chown=aemeath:aemeath /app/dist ./dist
COPY --from=builder --chown=aemeath:aemeath /app/prisma/main/generated ./prisma/main/generated
COPY --from=builder --chown=aemeath:aemeath /app/prisma/chat/generated ./prisma/chat/generated
COPY --from=builder --chown=aemeath:aemeath /app/frontend/dist ./frontend/dist
COPY --from=builder --chown=aemeath:aemeath /app/node_modules ./node_modules
COPY --from=builder --chown=aemeath:aemeath /app/package.json ./

# 复制 Playwright 浏览器二进制（从 builder 的 root 缓存目录）
COPY --from=builder --chown=aemeath:aemeath /root/.cache/ms-playwright /home/aemeath/.cache/ms-playwright

# 复制启动脚本
COPY --chown=aemeath:aemeath entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER aemeath

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/home/aemeath/.cache/ms-playwright

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bot"]
