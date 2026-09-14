# WorkHogee AI 获客伙计 - Dockerfile
# 多阶段构建，减小镜像体积

# ===== 构建阶段 =====
FROM node:18-alpine AS builder

WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# ===== 运行阶段 =====
FROM node:18-alpine AS runner

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S workhogee -u 1001

# 从构建阶段复制 node_modules
COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY . .

# 创建数据目录并设置权限
RUN mkdir -p /app/data && chown -R workhogee:nodejs /app

# 切换到非 root 用户
USER workhogee

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 启动应用
CMD ["node", "src/app.js"]
