# 阶段 1: 构建阶段 (Builder)
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 1. 先拷贝 package.json 和 lock 文件，利用 Docker 缓存层优化安装速度
COPY package.json package-lock.json* ./

# 2. 安装所有依赖（包括 devDependencies，用于编译 TS）
# --frozen-lockfile 确保 lock 文件一致性
RUN npm ci

# 3. 拷贝源代码
COPY . .

# 4. 执行 TypeScript 编译 (产出 dist 目录)
RUN npm run build

# 5. 清理 node_modules，只重装生产依赖（减小最终镜像体积）
# 这一步也可以放在 Runner 阶段做，但在 Builder 做可以利用缓存
RUN npm prune --production


# 阶段 2: 运行阶段 (Runner)
FROM node:18-alpine AS runner

# 设置时区为上海 (可选，方便查看日志)
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 创建非 root 用户 (安全最佳实践)
# alpine 默认自带 node 用户，我们直接使用
USER node

# 从 Builder 阶段拷贝构建产物和生产依赖
# 注意：只拷贝 dist 和 node_modules，源码 src 不需要
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
# 如果有静态资源（如 src/images），也需要拷贝
COPY --from=builder --chown=node:node /app/src/images ./src/images

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "dist/server.js"]