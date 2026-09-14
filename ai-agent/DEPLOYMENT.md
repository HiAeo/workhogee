# WorkHogee AI 获客伙计 - 后端部署指南

## 目录

1. [系统要求](#系统要求)
2. [环境变量配置](#环境变量配置)
3. [方案一：Render.com 一键部署（推荐快速上线）](#方案一rendercom-一键部署)
4. [方案二：Docker 容器化部署（推荐生产环境）](#方案二docker-容器化部署)
5. [方案三：云服务器直接部署](#方案三云服务器直接部署)
6. [域名配置和 HTTPS](#域名配置和-https)
7. [数据库配置（PostgreSQL）](#数据库配置postgresql)
8. [验证部署](#验证部署)
9. [常见问题](#常见问题)

---

## 系统要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- （可选）PostgreSQL >= 14
- （可选）Docker >= 20.10

---

## 环境变量配置

复制 `.env.example` 为 `.env`，并填入实际值：

```bash
cp .env.example .env
```

### 关键环境变量

| 变量 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `NODE_ENV` | 运行环境 | 否 | `development` |
| `PORT` | 服务端口 | 否 | `3000` |
| `HOST` | 监听地址 | 否 | `0.0.0.0` |
| `DATABASE_ENABLED` | 是否启用 PostgreSQL | 否 | `false` |
| `DATABASE_URL` | PostgreSQL 连接字符串 | 条件必填 | - |
| `JWT_SECRET` | JWT 签名密钥（生产环境必须修改！） | **是** | - |
| `JWT_EXPIRES_IN` | Access Token 有效期 | 否 | `7d` |
| `LLM_PROVIDER` | LLM 提供商 | 否 | `deepseek` |
| `LLM_API_KEY` | LLM API Key | **是** | - |
| `LLM_BASE_URL` | LLM API 地址 | 否 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 使用的模型 | 否 | `deepseek-chat` |

> ⚠️ **重要**：生产环境必须修改 `JWT_SECRET`，使用随机字符串。可以用以下命令生成：
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 方案一：Render.com 一键部署

Render.com 是最简单的部署方式，适合快速上线。

### 步骤

1. **注册 Render.com 账号**
   - 访问 https://render.com
   - 使用 GitHub 账号登录

2. **连接 GitHub 仓库**
   - 在 Render 仪表盘点击 "New" → "Web Service"
   - 选择你的 `workhogee` 仓库
   - 授权 Render 访问仓库

3. **配置服务**
   - **Name**: `workhogee-api`
   - **Region**: 选择离用户最近的区域（如 Singapore）
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/app.js`
   - **Instance Type**: 选择 `Starter`（$7/月）或更高

4. **配置环境变量**
   在 "Environment" 部分添加以下变量：
   ```
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   JWT_SECRET=<你的随机密钥>
   LLM_API_KEY=<你的 DeepSeek API Key>
   ```

5. **部署**
   - 点击 "Create Web Service"
   - 等待部署完成（通常 2-5 分钟）
   - 部署成功后，Render 会提供一个 `https://workhogee-api.onrender.com` 域名

### 优点
- 一键部署，无需运维
- 自动 HTTPS
- 自动从 GitHub 部署
- 免费额度可用于测试

### 缺点
- 免费版 15 分钟无请求会休眠
- 付费版最低 $7/月
- 自定义域名需要付费版

---

## 方案二：Docker 容器化部署

Docker 部署适合生产环境，可移植性强。

### 前置要求

- 已安装 Docker 和 Docker Compose
- 服务器有公网 IP

### 步骤

1. **克隆代码到服务器**
   ```bash
   git clone https://github.com/HiAeo/workhogee.git
   cd workhogee/ai-agent
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env，填入实际值
   nano .env
   ```

3. **启动服务**
   ```bash
   # 仅启动应用（使用 JSON 文件存储）
   docker-compose up -d app

   # 启动应用 + PostgreSQL
   docker-compose up -d
   ```

4. **查看日志**
   ```bash
   docker-compose logs -f app
   ```

5. **验证服务**
   ```bash
   curl http://localhost:3000/api/health
   ```

### 常用命令

```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose restart app

# 重新构建
docker-compose build --no-cache app
docker-compose up -d app

# 查看数据库
docker-compose exec postgres psql -U workhogee -d workhogee
```

### 优点
- 环境一致，可移植性强
- 一键启动应用 + 数据库
- 易于扩展和升级
- 非 root 用户运行，安全性高

### 缺点
- 需要一定的 Docker 知识
- 服务器需要安装 Docker

---

## 方案三：云服务器直接部署

适合有运维经验的用户，性能最好。

### 推荐配置

- **CPU**: 2 核
- **内存**: 4GB
- **系统**: Ubuntu 22.04 LTS / CentOS 8
- **带宽**: 5Mbps+

### 步骤（以 Ubuntu 为例）

1. **安装 Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node --version
   ```

2. **安装 PostgreSQL（可选）**
   ```bash
   sudo apt-get install -y postgresql postgresql-contrib
   sudo systemctl start postgresql
   sudo systemctl enable postgresql

   # 创建数据库和用户
   sudo -u postgres psql
   CREATE DATABASE workhogee;
   CREATE USER workhogee WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE workhogee TO workhogee;
   \q
   ```

3. **克隆代码**
   ```bash
   git clone https://github.com/HiAeo/workhogee.git
   cd workhogee/ai-agent
   ```

4. **配置环境变量**
   ```bash
   cp .env.example .env
   nano .env
   ```

5. **安装依赖并启动**
   ```bash
   npm install --production

   # 前台启动（测试用）
   node src/app.js

   # 后台启动（生产用）
   chmod +x start-production.sh
   ./start-production.sh --daemon
   ```

6. **使用 PM2 管理进程（推荐）**
   ```bash
   npm install -g pm2
   pm2 start src/app.js --name workhogee
   pm2 save
   pm2 startup
   ```

### 优点
- 性能最好，资源利用率最高
- 完全可控
- 成本最低

### 缺点
- 需要运维知识
- 需要自己配置 HTTPS 和域名
- 需要自己处理进程管理和日志

---

## 域名配置和 HTTPS

### 使用 Nginx 反向代理（推荐）

1. **安装 Nginx**
   ```bash
   sudo apt-get install -y nginx
   ```

2. **配置 Nginx**
   ```bash
   sudo nano /etc/nginx/sites-available/workhogee
   ```

   填入以下内容：
   ```nginx
   server {
       listen 80;
       server_name api.workhogee.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **启用配置**
   ```bash
   sudo ln -s /etc/nginx/sites-available/workhogee /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **配置 HTTPS（使用 Let's Encrypt）**
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d api.workhogee.com
   ```

### DNS 配置

在域名服务商处添加 A 记录：
- **主机记录**: `api`
- **记录类型**: `A`
- **记录值**: 你的服务器公网 IP
- **TTL**: 600

---

## 数据库配置（PostgreSQL）

默认情况下，应用使用 JSON 文件存储，无需配置数据库。

如需启用 PostgreSQL：

1. **设置环境变量**
   ```bash
   DATABASE_ENABLED=true
   DATABASE_URL=postgresql://workhogee:password@localhost:5432/workhogee
   ```

2. **初始化数据库表**
   ```bash
   npm run db:init
   ```

3. **重启应用**
   ```bash
   pm2 restart workhogee
   ```

### 数据库表结构

应用包含以下核心表：
- `tenants` - 租户表
- `users` - 用户表
- `leads` - 线索表
- `conversations` - 对话表
- `messages` - 消息表
- `knowledge_documents` - 知识库文档
- `knowledge_faqs` - 知识库FAQ
- `email_accounts` - 邮箱账号
- `emails` - 邮件
- `notifications` - 通知
- `reports` - 报告
- `api_keys` - API密钥
- `audit_logs` - 审计日志

---

## 验证部署

部署完成后，通过以下方式验证：

### 1. 健康检查
```bash
curl https://api.workhogee.com/api/health
```

预期返回：
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2026-09-14T..."
}
```

### 2. 测试用户注册
```bash
curl -X POST https://api.workhogee.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456","name":"Test User"}'
```

### 3. 测试用户登录
```bash
curl -X POST https://api.workhogee.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'
```

### 4. 测试对话
```bash
curl -X POST https://api.workhogee.com/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"source":"web"}'
```

---

## 常见问题

### Q: 部署后访问显示 502 Bad Gateway？
A: 检查应用是否正常启动，查看日志：
```bash
pm2 logs workhogee
# 或
docker-compose logs app
```

### Q: 如何更新应用？
```bash
git pull
npm install --production
pm2 restart workhogee
# 或
docker-compose build --no-cache app
docker-compose up -d app
```

### Q: 数据存在哪里？
- 不启用数据库时：`data/` 目录下的 JSON 文件
- 启用数据库时：PostgreSQL 数据库

### Q: 如何备份数据？
```bash
# JSON 文件备份
tar -czf workhogee-backup-$(date +%Y%m%d).tar.gz data/

# PostgreSQL 备份
pg_dump -U workhogee workhogee > workhogee-backup.sql
```

### Q: 如何查看 API 文档？
访问 `https://api.workhogee.com/api/health` 查看健康状态，完整 API 文档请参考代码中的路由定义。

---

## 技术支持

如遇到部署问题，请：
1. 查看应用日志
2. 检查环境变量配置
3. 确认端口是否开放
4. 检查防火墙和安全组配置

---

*最后更新：2026-09-14*
