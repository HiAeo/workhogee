# WorkHogee 统一 API 契约（Web / PWA / 微信小程序共用）

> 版本：v1.0（2026-09）
> 后端：Cloudflare Worker（`server-cloudflare/`），域名 `https://api.workhogee.com`。
> 原则：**一套后端、一套接口、三端共用**。本文件是接口的唯一事实源；新增 / 变更接口必须先改本文件再写代码。
> 本文取代并升级早期的 [`../server-cloudflare/API-小程序端接口设计.md`](../server-cloudflare/API-小程序端接口设计.md)（那份仍存档，命名停留在旧"二手车行版 / 生图伙计"，但其统一包络、错误码、能力开关设计继续有效）。

---

## 1. 端中立总原则

1. **不为某一端定制参数或返回结构**。接口描述"业务资源"，不描述"网页 / 小程序"。三端请求同一 URL、同一字段。
2. **Bearer Token 鉴权**：`Authorization: Bearer <accessToken>`。不依赖 Cookie、不依赖浏览器会话；小程序没有 Cookie 也能直接调。
3. 统一 JSON 包络、统一错误码、统一分页 / 时间 / 金额 / 枚举格式（见 §3）。
4. 只使用各端都能发出的标准 HTTPS + JSON + `multipart/form-data`（或预签名直传）；不要求浏览器专有 Header / 特性。
5. 密钥（火山方舟、TOS、各平台 OAuth Secret）**只在 Worker**，任何端都不持有、不下发。
6. 能力差异由服务端 `GET /config` 的 `capabilities` 声明，端上按开关渲染，**不硬编码承诺**未就绪能力。
7. 接口向后兼容；不兼容变更走版本前缀（见 §6）。

---

## 2. 现状路由盘点（以 `worker.js` 路由表为准）

> 下表为代码中已确认的路由；"目标路径"列为中立化后的规划，**存量路径保留兼容，新增接口一律走 `/api/v1`**。

| 现状路径 | 方法 | 能力 | 模块 | 鉴权 | 目标路径 |
|---|---|---|---|---|---|
| `/health` | GET | 探活 | worker | 无 | `/health`（保留） |
| `/config` | GET | 公开配置 / 能力开关 | worker | 无 | `/api/v1/config` |
| `/kb` | GET | 行业知识库（车型卖点等） | kb-data | 无/可选 | `/api/v1/kb`（泛化为行业知识，二手车为其一） |
| `/generate` | POST | 出图（同步，v1 收 dataURL） | vision | 会员 | `/api/v1/assets/generate` |
| `/verify` | POST | 出图一致性后验 | vision | 会员 | 并入 `/assets/generate` 的校验阶段 |
| `/qc` | POST | 图像质检 | vision/image-meta | 会员 | `/api/v1/assets/qc` |
| `/copy` | POST | 文案 / 卖点生成 | vision | 会员 | `/api/v1/copy/generate` |
| `/identify` | POST | 视觉识别（商品 / 行业） | vision | 会员 | `/api/v1/vision/identify` |
| `/storyboard` | POST | 视频分镜（阿视） | vision | 会员 | `/api/v1/video/storyboard` |
| `/api/understand` | POST | 自然语言意图路由（对话入口） | worker | 会员 | `/api/v1/agent/understand` |
| `/api/tasks` | GET | 任务 / 对话列表 | worker | 会员 | `/api/v1/tasks` |
| `/api/tasks/sync` | POST | 任务整对象同步（含 msgs） | worker | 会员 | `/api/v1/tasks:sync`（或 `/tasks/batch`） |
| `/api/storage` | POST | TOS 预签名直传凭据 | tos | 会员 | `/api/v1/storage/presign` |
| `/api/feed`、`/api/feed/*` | GET/POST | 官方素材墙（Hogee 创作探索 / 做同款） | feed | 读公开 / 写 admin | `/api/v1/feed` |
| `/api/member`、`/api/member/*` | * | 会员：注册登录 / 资料 / 知识库 / 额度 / 发布登记 | member-api/members | 会员 | `/api/v1/me/*`、`/api/v1/auth/*` |
| `/api/admin`、`/api/admin/*` | * | 管理后台（仅管理员） | admin | 管理员 | `/api/v1/admin/*` |

> 已建模块、路径待在 M1 补登进本表：`analytics.js / analytics-store.js`（效果数据）、`qrcode-svg.js`（渠道码）、showcases（H5 画册）。补登时以 `worker.js` 实际匹配路径为准，**不得凭名称臆造**。

---

## 3. 通用约定

### 3.1 Base URL 与传输

- 生产：`https://api.workhogee.com`；兜底：`workers.dev` 域名（健康检查用于主备切换）。
- 全程 HTTPS；请求 / 响应默认 `application/json; charset=utf-8`。
- 文件字节流走 TOS 预签名直传（§5），不经 Worker 转发大文件。

### 3.2 鉴权与标准 Header

| Header | 必填 | 说明 |
|---|---|---|
| `Authorization` | 需登录接口 | `Bearer <accessToken>` |
| `Content-Type` | 是 | `application/json`（直传时按预签名要求） |
| `X-Client` | 建议 | `web` / `pwa` / `miniapp`，用于统计与灰度 |
| `X-Client-Version` | 建议 | 端版本号，如 `web/1.4.0`、`miniapp/1.0.0` |
| `X-Device-Id` | 建议 | 匿名设备指纹（未登录限流 / 对账），端中立生成 |
| `Idempotency-Key` | 写操作建议 | UUID，防重复出图 / 重复下单 / 重复发布登记 |

- **禁止**依赖 `Cookie`、`Referer`、`X-Requested-With` 等浏览器特征做鉴权或业务判断。
- CORS 由服务端按白名单（`www.workhogee.com` 等）回 `Access-Control-Allow-*`；小程序为服务端请求，不受 CORS 限制。

### 3.3 统一响应包络

成功：

```json
{ "ok": true, "data": { } }
```

> 存量接口多为 `{ "ok": true, ...字段平铺 }`；**新增接口统一包 `data`**，存量在版本化时逐步收敛，期间前端 httpClient 兼容两种形态。

失败：

```json
{ "ok": false, "error": { "code": "rate_limited", "message": "操作过于频繁，请稍后再试", "details": { } } }
```

- `code`：稳定的机器可读小写下划线枚举，端上据此分支处理 / 国际化文案；`message`：可直接展示的中文兜底文案。
- HTTP 状态码与 `code` 一致使用，不要只看 200。

### 3.4 错误码表（跨端统一）

| HTTP | code | 含义 | 端处理建议 |
|---|---|---|---|
| 400 | `bad_json` / `bad_params` | 请求体 / 参数不合法 | 表单提示，修正后重试 |
| 401 | `unauthorized` | 未登录 / token 失效 | 清会话、跳登录；httpClient 自动刷新一次 |
| 403 | `forbidden` | 无权限（如非 admin 写 feed） | 隐藏入口 + 提示 |
| 404 | `not_found` | 资源 / 路由不存在 | 检查路径与资源 id |
| 409 | `conflict` / `idempotent_replay` | 状态冲突 / 幂等重放 | 拉取最新状态，不重复提交 |
| 413 | `file_too_large` | 文件超限 | 端上先压缩，或走直传 |
| 415 | `unsupported_media_type` | 格式不支持 | 转换格式后重传 |
| 422 | `unprocessable` | 内容校验未过（如不合规图） | 按 `details.field` 提示 |
| 429 | `rate_limited` | 触发限流 | 按 `Retry-After` 退避重试 |
| 402 | `quota_exceeded` | 额度 / 套餐不足 | 引导加量包 / 订阅（不谎报权益） |
| 500 | `server_misconfigured` | 服务端密钥 / 配置缺失 | 稍后重试 + 上报 |
| 502 | `upstream_network` / `upstream_5xx` / `no_image` | 模型侧异常 | 自动重试 ≤2 次后提示 |
| 504 | `timeout` | 生成超时（端上也归一为此码） | 保留任务，允许手动重试 / 转异步轮询 |

### 3.5 数据格式约定

- **分页**（列表统一）：
  请求 `?cursor=&limit=`；响应 `{ "items": [], "nextCursor": "…", "hasMore": false, "total?" }`。小程序 / Web 同一套，不用 page/pagesize 与 cursor 混用。
- **时间**：JSON 内统一毫秒级 Unix 时间戳（数字）或 ISO8601 字符串，二选一后全表统一（建议 ISO8601 `2026-09-22T10:00:00+08:00`）；端上按本地时区渲染。
- **金额**：整数**分** + `currency`（`CNY`），不使用浮点元。
- **枚举**：小写下划线字符串（`status: "in_progress"`），不用数字魔法值、不用中文做枚举。
- **资源 id**：字符串，端上不解析其结构（不假设自增 / 顺序）。
- **空值**：明确字段缺省用 `null`，不用空字符串冒充；数组空用 `[]`。
- **布尔能力**：只来自 `capabilities`，端上不自行推断"应该支持"。

---

## 4. 资源契约（业务域）

> 下列给出**资源模型与端中立要求**；具体字段随实现迭代，变更须回本文件登记。标注"现状"的为已实现行为。

### 4.1 配置与健康

- `GET /health` → `{ ok:true, status:"healthy", ts }`。
- `GET /config`（现状）返回模型规格与合规能力开关：

```json
{
  "ok": true,
  "version": "1.0.0",
  "image": { "provider": "volcengine-seedream", "sizes": ["2048x2048"], "minPixels": 3686400 },
  "capabilities": {
    "aiLabel": true, "bannedWordsFilter": true,
    "colorConsistencyVerify": false, "accidentTracePreserve": false, "plateFaceVinMask": false,
    "realImageToVideo": false, "oauth": { "wechat": false, "xiaohongshu": false, "douyin": false }
  }
}
```

端上据 `capabilities` 渲染"已生效 / 内测 / 待开通"，**不得硬编码承诺**。

### 4.2 认证与会话 auth / member

- 登录按授权方式可插拔，端中立：`POST /api/v1/auth/login { provider, payload }`，统一返回会话：

```json
{ "ok": true, "data": { "accessToken": "…", "expiresIn": 7200, "member": { "id": "", "role": "member|admin", "plan": "", "identity": "person|enterprise" } } }
```

- `provider`：`wechat`（小程序 `wx.login` code / Web 扫码 ticket）、`phone`（手机号 + 验证码，内测可回 devCode，由 config 开关）、`email`、`feishu`、`dingtalk`、`qq`。新增 provider **不改业务接口**。
- `GET /api/v1/me` 资料；`PATCH /api/v1/me` 更新；`POST /auth/logout`；`POST /auth/refresh`。
- 会员额度 / 套餐 / 加量包：`GET /api/v1/me/billing`、`POST /api/v1/me/orders`；额度判断**以后端为准**，端上 `hogee_gen_count` 仅作展示。
- 管理员：`auth.js` 已实现 PBKDF2 + KV session、`Authorization: Bearer`，路径归并到 `/api/v1/admin/*`，与会员鉴权分层（管理员令牌不与会员令牌混用）。

### 4.3 智能体对话 / 意图

- `POST /api/v1/agent/understand`：入参为对话上下文（消息、选中的 agent 模式 / 技能、附件引用），返回意图与下一步（出图 / 文案 / 视频 / 发布 / 澄清问题）。
- 置信度不足时服务端给 `clarify`，端上追问；端上关键词兜底仅作离线降级，不作为主路径。

### 4.4 资产生成（图 / 文案 / 视频）

- 出图（现状 `/generate`，同步 v1）：`{ prompt, image: <dataURL 或 AssetRef>, size, ratio, quality, format, skill, options }` → `{ ok, assets:[AssetRef], traceId }`。
  - **v2 目标**：入参图片传 AssetRef（先经 §5 直传），输出也落 TOS 返回引用，不在 JSON 里塞大 base64。
  - 支持多图输入、多产物输出（一次任务可返回多张 / 多规格），并支持对单张产物"单独重做"（`POST /assets/:id/rework`）。
  - 吃完整提示词，不在端上 / 服务端粗暴截断（长度上限由服务端显式返回 `maxPromptChars`，超长给 422 而非静默截断）。
- 文案 `/api/v1/copy/generate`：入参商品引用、行业、渠道、语气、语言；返回标题 / 正文 / 标签 / 多语言版本。
- 视觉识别 `/api/v1/vision/identify`：返回商品类别、建议行业（用于自动匹配技能）、可结构化字段（置信度标注，识别不到不臆造）。
- 视频 `/api/v1/video/storyboard`：现状为分镜 + 端上 Canvas 合成 fallback；真实图生视频未授权，`capabilities.realImageToVideo=false` 时 UI 标"内测"。

### 4.5 上传与对象存储 storage（见 §5）

### 4.6 任务 tasks（异步 / 跨端同步）

- 生成类统一任务模型：`POST /api/v1/tasks` 创建 → 返回 `taskId`；`GET /api/v1/tasks/:id` 轮询状态；（Web 增强）可选 SSE `/tasks/:id/events`，**小程序只用轮询**，接口数据一致。
- 任务状态枚举：`queued | in_progress | succeeded | failed | canceled`；失败带 `error.code`。
- 对话 / 任务列表跨端同步：现状 `/api/tasks`(GET) 与 `/api/tasks/sync`(POST，整对象含 msgs)。v1 收敛为 `GET /tasks?cursor=` + `PUT /tasks/:id`（带 `updatedAt` 做最后写入获胜 / 冲突检测）。置顶、重命名、归档是任务字段，三端一致。
- 本地缓存仅为离线加速；登录后以服务端为准合并。

### 4.7 我的作品 works

- `GET /api/v1/works?type=image|video|copy&cursor=`：分类列出成品（图 / 视频 / 文案），引用 TOS 资源。
- 二次创作：`POST /api/v1/works/:id/rework`；删除 `DELETE`；编辑 `PATCH`。
- 作品本体在 TOS，索引在 KV / 未来数据库；端上 IndexedDB / Storage 只缓存。

### 4.8 知识库 kb

- 引导式分类录入（基础信息：个人 / 企业、联系方式、主营、行业；资料分类：产品原图 / 成品图 / 介绍文档 / 宣传视频 / 说明书 / 其他）。
- `GET/PUT /api/v1/me/kb`（结构化资料）；文件走 §5 直传后登记 `kb/assets`。
- 行业选择联动技能（选二手车 → 自动挂二手车能力），但知识库 / 技能是**全行业可扩展**，不写死二手车。
- 画册等场景自动预填联系方式等字段（取自 kb，用户可改）。
- 文档解析（PDF / Word / 图片 OCR）未就绪由 capability 标注"服务端升级后启用"；文本资料即刻可用于文案。

### 4.9 发布 publish（半自动分发）

- 边界：WorkHogee 产出"就绪包"（图 / 视频 / 标题 / 正文 / 标签 / 尺寸适配），**最后一下"发送"由用户本人在平台完成或经官方 OAuth 授权**；不代发、不存平台密码 / Cookie。
- `GET /api/v1/connections`：通讯工具与媒体账号连接状态；未 OAuth 的渠道状态为 `available | pending`，只能"登记 + 待开通"，不得返回 `connected` 假象。
- `POST /api/v1/publish/packages`：生成某渠道就绪包（小红书 / 抖音 / 朋友圈(微信·企微) 为首期；公众号 / 微博 / 闲鱼 / 视频号 / B 站 / 快手 / 知乎 / 头条为后续）。
- `POST /api/v1/publish/records`：登记"做了哪些素材、发到哪、日期"，效果数据回流（§4.10）。

### 4.10 效果 analytics

- `GET /api/v1/analytics/overview`、`/records?cursor=`：以**列表 + 核心指标**为主（展现、浏览、互动、留资、转化），不强制图表。
- 数据来源：用户登记 + 已授权渠道回传；未授权渠道不编造数字，展示"待连接 / 手动录入"。

### 4.11 官方素材墙 feed（Hogee 创作探索）

- `GET /api/v1/feed` 公开（含素材 URL、类型、提示词、`allowRemix`）；所有用户可查看提示词与"做同款"。
- 写 / 删仅管理员（`role=admin`，账号 workhogee）：`POST/PUT/DELETE /api/v1/feed/*`；普通会员上传的素材**不进公共墙**、不跨设备持久（现状设计，避免误以为是 bug）。
- 管理员可维护素材提示词（用于"做同款"预填）。

---

## 5. 文件上传与异步任务规范

### 5.1 预签名直传（三端一致）

1. 端上选图后先做轻压缩（`uploader.compressImage`，能力按端实现）。
2. `POST /api/v1/storage/presign { filename, contentType, size, kind:"source|work|feed|kb" }`
   → `{ uploadUrl, method, headers, asset:{ id, key, url, public? } }`。
3. 端上用返回的 `uploadUrl + headers` 直传 TOS（Web `fetch/xhr`、小程序 `Taro.uploadFile`），带进度回调。
4. 业务接口只传 `asset.id / key`，不传字节。
- 私有前缀 `u/<memberId>/...`；公共墙前缀 `feed/`（由后端按权限签发，端上不能自选公共前缀）。
- 多图：循环 presign + 直传（可并发限流），后端不限制"一次一张"。

### 5.2 同步 vs 异步

- v1 小图可同步出图（≤ 约定时限）；超时 / 大任务 / 视频统一转**任务模型**（§4.6），端上轮询，不长期挂连接。
- 重试：`upstream_* / timeout` 由 httpClient 幂等重试（配合 `Idempotency-Key`），最多 2 次；`4xx` 不自动重试。

---

## 6. 版本演进与兼容

- 新接口一律 `/api/v1/...`；存量无版本路径（`/generate`、`/api/tasks` 等）继续可用，下线前在本文件标注 `deprecated` 并给迁移窗口。
- 向后兼容改动（加可选字段、加接口、加枚举值）直接做；**删字段 / 改语义 / 改类型**走新版本号。
- 枚举新增值端上要能兜底（未知枚举走默认展示，不崩）。
- 建议后端据本文件导出 OpenAPI，前端 / 小程序生成 `api-types`，消除手写类型漂移。

---

## 7. 安全要求（接口侧）

- CORS 白名单显式配置，不用 `*` 配合凭证；预检 `OPTIONS` 正确返回。
- 限流：匿名按 `X-Device-Id` / IP，登录按 member id；生成类默认阈值（如每分钟 N 次），超限 429 + `Retry-After`。
- 所有出网密钥在 Worker，日志 / 错误 / 响应不回显密钥；TOS 预签名最小权限、短时效、限定 key 前缀与 content-length。
- 输入校验在服务端（图片类型 / 大小 / 提示词 / 禁用词）；合规水印 / AI 标识服务端可控；像素级脱敏（车牌 / 人脸 / VIN）未上线前由 capability 如实声明。
- 管理员与会员鉴权分层；管理接口额外校验 session 角色。

---

## 8. 待办（中立化差距，纳入迁移路线）

| 项 | 现状 | 目标 | 阶段 |
|---|---|---|---|
| 版本前缀 | 新旧路径混用 `/generate` 与 `/api/*` | 新增统一 `/api/v1`，存量 deprecate | M1–M3 |
| 响应包络 | 部分平铺、部分包 data | 统一 `{ok,data}` / `{ok,error}`，httpClient 兼容 | M1 |
| 上传传参 | v1 收 base64 dataURL | 预签名直传 + AssetRef，多图 | M2 |
| 异步 | 出图同步等待 | 任务模型 + 轮询（Web 可 SSE） | M2 |
| 任务同步 | `/api/tasks/sync` 整对象覆盖 | `PUT /tasks/:id` + updatedAt 冲突检测 | M2 |
| analytics/showcases/qrcode 路由 | 模块在、未在契约登记 | 核对 worker.js 后补登 | M1 |
| 行业知识库 | `/kb` 命名偏二手车 | 泛化行业知识，二手车为内置行业之一 | M2 |
| OpenAPI | 无 | 后端导出，三端生成类型 | M5 前 |
