# WorkHogee 后端部署指南

本文档指导你如何将 WorkHogee AI 获客伙计后端服务部署到外网，使客户可以通过互联网访问管理后台。

## 目录

- [方案一：Render.com 免费部署（推荐）](#方案一rendercom-免费部署推荐)
- [方案二：内网穿透快速部署](#方案二内网穿透快速部署)
- [方案三：云服务器部署](#方案三云服务器部署)
- [配置管理后台 API 地址](#配置管理后台-api-地址)

---

## 方案一：Render.com 免费部署（推荐）

Render.com 提供免费的 Web Service 额度，适合中小型应用部署。

### 1. 准备工作

- 注册 [Render.com](https://render.com) 账号（可使用 GitHub 登录）
- 将后端项目上传到 GitHub 仓库（建议新建私有仓库）

### 2. 创建 GitHub 仓库

在本地后端项目目录（`ai-agent/`）执行：

```bash
cd ai-agent
git init
git add .
git commit -m "WorkHogee AI Agent backend"
```

在 GitHub 创建新仓库（如 `workhogee-backend`），然后推送：

```bash
git remote add origin https://github.com/你的用户名/workhogee-backend.git
git push -u origin main
```

### 3. 在 Render 上创建 Web Service

1. 登录 Render.com，点击右上角 **New +** → **Web Service**
2. 选择你刚创建的 GitHub 仓库
3. 配置如下：

| 配置项 | 值 |
|--------|-----|
| Name | workhogee-backend（自定义） |
| Region | Singapore（离中国近） |
| Branch | main |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `node src/app.js` |
| Instance Type | Free（免费） |

4. 点击 **Advanced** → **Add Environment Variable**，添加以下环境变量：

| Key | Value |
|-----|-------|
| PORT | `10000` |
| HOST | `0.0.0.0` |
| DEEPSEEK_API_KEY | `你的 DeepSeek API Key` |

5. 点击 **Create Web Service** 开始部署

### 4. 修改配置文件以支持环境变量

Render 的免费实例会动态分配端口，需要修改 `config/default.json` 或代码以支持环境变量。

修改 `src/app.js` 中的启动部分：

```javascript
// 原代码
const PORT = config.server.port || 3000;
const HOST = config.server.host || 'localhost';

// 修改为
const PORT = process.env.PORT || config.server.port || 3000;
const HOST = process.env.HOST || '0.0.0.0';
```

同时修改 LLM 配置以支持环境变量：

```javascript
// 在 src/services/llm.js 中，将 apiKey 改为：
const apiKey = process.env.DEEPSEEK_API_KEY || config.llm.apiKey;
```

### 5. 部署完成

部署成功后，Render 会给你一个域名，如：
`https://workhogee-backend.onrender.com`

管理后台 API 地址为：
`https://workhogee-backend.onrender.com/api`

> **注意**：Render 免费实例在 15 分钟无请求后会休眠，下次请求需要约 30 秒启动。如需稳定运行，可升级到付费实例（$7/月起）。

---

## 方案二：内网穿透快速部署

如果你希望立即通过外网访问，且后端运行在你本地电脑上，可以使用内网穿透工具。

### 推荐工具

| 工具 | 免费额度 | 特点 |
|------|----------|------|
| [cpolar](https://www.cpolar.com) | 1条隧道，1MB/s | 国内访问快，支持固定域名 |
| [ngrok](https://ngrok.com) | 1条隧道，随机域名 | 国际知名，稳定 |
| [frp](https://github.com/fatedier/frp) | 需自有服务器 | 开源，完全可控 |

### 使用 cpolar 快速部署（推荐国内用户）

1. 下载并安装 [cpolar](https://www.cpolar.com/download)
2. 注册账号并获取 authtoken
3. 启动本地后端服务（确保 localhost:3000 可访问）
4. 执行内网穿透：

```bash
cpolar http 3000
```

5.  cpolar 会显示一个公网地址，如：
   `https://abc123.cpolar.cn`

6. 管理后台 API 地址为：
   `https://abc123.cpolar.cn/api`

> **注意**：免费版 cpolar 域名每次重启会变化，如需固定域名需升级付费版。

---

## 方案三：云服务器部署

如果你有云服务器（阿里云、腾讯云、AWS 等），可以直接部署。

### 1. 环境要求

- Node.js 16+
- 至少 1GB 内存

### 2. 部署步骤

```bash
# 1. 上传项目到服务器
scp -r ai-agent/ user@your-server:/opt/workhogee/

# 2. 登录服务器
ssh user@your-server

# 3. 安装依赖
cd /opt/workhogee/ai-agent
npm install --production

# 4. 使用 PM2 守护进程
npm install -g pm2
pm2 start src/app.js --name workhogee
pm2 save
pm2 startup

# 5. 配置 Nginx 反向代理（可选）
# 在 /etc/nginx/sites-available/ 中添加配置
```

### 3. Nginx 配置示例

```nginx
server {
    listen 80;
    server_name admin.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 配置管理后台 API 地址

后端部署完成后，需要在管理后台配置 API 地址：

1. 访问管理后台：`https://www.workhogee.com/admin/`
2. 点击左侧菜单 **系统设置**
3. 在 **后端 API 配置** 面板中，输入你的后端 API 地址：
   - Render 部署：`https://workhogee-backend.onrender.com/api`
   - 内网穿透：`https://abc123.cpolar.cn/api`
   - 云服务器：`https://admin.yourdomain.com/api`
4. 点击 **保存 API 地址**，页面会自动刷新
5. 刷新后检查右上角服务器状态，显示 **在线** 即配置成功

### 恢复本地访问

如果需要恢复本地访问，在 API 地址输入框中输入 `/api`，点击保存即可。

---

## 常见问题

### Q: 部署后 API 调用报 CORS 错误？

A: 后端已配置 `cors()` 中间件，允许所有来源访问。如果仍有问题，检查 Nginx 配置是否正确转发了 OPTIONS 请求。

### Q: Render 免费版休眠后首次访问很慢？

A: 这是正常现象。可以使用 [UptimeRobot](https://uptimerobot.com) 等免费监控服务，每 5 分钟访问一次你的 Render 服务，防止休眠。

### Q: 数据存储在哪里？会丢失吗？

A: 当前版本使用本地文件系统存储数据（`data/` 目录）。Render 免费实例的文件系统是临时的，重启后数据会丢失。生产环境建议配置 PostgreSQL 或 MongoDB 数据库。

### Q: 如何配置自定义域名？

A: 
- Render：在服务设置的 **Custom Domains** 中添加你的域名，然后在域名解析中添加 CNAME 记录指向 Render 提供的地址
- 云服务器：在 Nginx 配置中设置 `server_name`，并配置 SSL 证书（可使用 Let's Encrypt 免费证书）

---

## 技术支持

如遇部署问题，请参考：
- 项目文档：https://www.workhogee.com/docs/
- GitHub 仓库：https://github.com/HiAeo/workhogee
