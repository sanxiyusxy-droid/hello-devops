# ---------- 阶段 1：只装生产依赖 ----------
# 单独一层是为了利用缓存：只要 package-lock.json 没变，这一层就不会重新执行。
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- 阶段 2：运行时镜像 ----------
# 不带 npm 缓存、不带 devDependencies，镜像因此小很多。
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# 构建时注入版本号，CI 会把 git tag 传进来
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# 用非 root 用户跑（node 镜像自带 node 用户），是容器安全的基本要求
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
