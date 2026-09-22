# WorkHogee · 你生意的好伙计

> 做生意，找伙计。WorkHogee 把卖家从**拍摄 / 识别 / 生成图文视频 / 合规 / 多平台分发 / 效果追踪**的杂活里解放出来：
> 老板只管提供一张产品图，剩下的交给伙计。
>
> 产品面向**全行业商家**（首期主攻二手车商仅是市场策略，不是产品边界）。五个伙计接力：
> **阿图**生图 · **阿文**写文案 · **阿视**做视频 · **阿发**半自动分发 · **阿果**盯效果。

---

## 1. 这是什么

WorkHogee 当前由三部分组成：

| 层 | 目录 | 技术 | 说明 |
|---|---|---|---|
| 官网 / Web 工作台 | 仓库根目录的 `*.html` | 原生 HTML/CSS/JS（无构建） | `index.html` 官网、`workbench.html` Web 工作台、`global.html` 外贸版、`analytics.html` 效果中心、`admin/` 管理后台 |
| 后端（唯一事实源） | [`server-cloudflare/`](server-cloudflare/) | Cloudflare Worker（ES Module）+ KV + 火山引擎方舟 + 火山 TOS | 所有 AI Key 只存在服务端；Web / PWA / 小程序**共用同一套 API** |
| 设计与规范 | [`docs/`](docs/) | Markdown | 多端开发规范、统一 API 契约、迁移路线 |

> 现阶段只上线 **Web**；但所有开发都按"**一次开发，多端复用**"进行，后续在同一套后端与业务核心上扩展 **PWA** 与**微信小程序**。

---

## 2. 最高优先级工程原则（强制）

**所有开发必须先读并遵守：**

1. [`docs/多端开发规范.md`](docs/多端开发规范.md) —— 分层、适配层、跨端样式、登录 / 上传 / 路由 / 通知抽象、注释标注、提交前 Checklist。
2. [`docs/API契约.md`](docs/API契约.md) —— Web / PWA / 小程序共用的中立接口规范与现状路由盘点。

一句话：

> **写 Web 的时候，心里要想着它以后还要跑在 PWA 和微信小程序上。业务逻辑独立、API 通用、UI 可替换。**

- 业务逻辑（图片处理、文案生成、任务状态、数据计算）写进 **services / utils**，不写进页面组件，不直接碰 DOM / `window` / `localStorage`。
- UI 只负责展示与交互，**只通过 services 层调后端**。
- 平台差异（存储、上传、路由、登录、通知、设备能力）收敛到 **adapters 适配层**，未来小程序只替换这一层。
- 后端接口保持**端中立**：Bearer Token 鉴权、统一 JSON 包络、不依赖 Cookie 或浏览器专有 Header。

历史背景见 [`DESIGN-GUIDELINES.md`](DESIGN-GUIDELINES.md) 与 [`README_工作流.md`](README_工作流.md)（早期自动化工作流，仅存档参考）。

---

## 3. 目录结构（现状 → 目标）

```
workhogee/
├─ index.html / workbench.html / global.html / analytics.html   # 现阶段 Web（根目录直发）
├─ member-auth.js / workbench-data.js / workbench-vendor.js      # 已外置的鉴权 / 数据 / 第三方库
├─ admin/                       # 管理后台（仅管理员，不对外开放）
├─ images/ logo/ media/ video/  # 静态素材与宣传片
├─ server-cloudflare/           # 【唯一后端】Cloudflare Worker，多端共用
│  ├─ worker.js                 #   路由入口
│  ├─ auth.js members.js member-api.js member-auth.js  # 鉴权 / 会员
│  ├─ vision.js image-meta.js   #   火山方舟：视觉理解 / 文案 / 出图代理
│  ├─ tos.js                    #   TOS 对象存储预签名直传
│  ├─ feed.js kb-data.js analytics.js analytics-store.js qrcode-svg.js admin.js
│  └─ API-小程序端接口设计.md     #   早期 v1 契约（已被 docs/API契约.md 取代并升级，存档）
└─ docs/                        # 【规范与设计】
   ├─ 多端开发规范.md
   └─ API契约.md
```

目标分层（**增量迁移、不一次性重写**，见规范文档"迁移路线"）：

```
web/src/
├─ adapters/web/    # 【Web 专用】http / storage / upload / router / auth / notify / device
├─ services/        # 【可复用】业务编排：generate / copy / storyboard / tasks / works / kb / publish / analytics
├─ utils/           # 【可复用】纯函数：校验、格式化、压缩、提示词、计费、枚举
└─ ui/              # 【Web 专用】页面与组件
packages/core/      # 未来：services + utils + 类型，被 Web 与小程序共同引用
miniapp/            # 未来：Taro（React + TS）微信小程序，复用 core，只替换 adapters 与 ui
```

---

## 4. 本地开发

### 4.1 Web（静态站）

静态站根目录直发，本地起任意静态服务器即可（不要用 `file://`，否则 `/images`、`/member-auth.js`、`/api` 都加载不到）：

```powershell
# Windows PowerShell，在仓库根目录
python -m http.server 8931 --bind 127.0.0.1
# 浏览器打开 http://127.0.0.1:8931/workbench.html
```

### 4.2 后端 Worker

```bash
cd server-cloudflare
npm install
npm run dev        # wrangler 本地开发
npm run deploy     # wrangler deploy 部署
```

- 密钥通过 `wrangler secret put <NAME>` 配置，**严禁写入前端、仓库或日志**（历史上发生过 Key 泄露应急，见规范"安全红线"）。
- 本地变量参考 `server-cloudflare/.dev.vars.example`（`.dev.vars` 不入库）。

### 4.3 交付前自检

- Web / HTML 改动：用 html skill 的 `scripts/shot.py` 跑桌面（1440×900）+ 移动（390×844）截图与结构检查，目检后再上线。
- 后端改动：跑 `server-cloudflare/selftest*.mjs`，部署后做线上真机回归。
- 静态站通过 GitHub 仓库 `main` 分支直发、Cloudflare 橙云加速；**边缘缓存约 10 分钟**，推送后需等缓存自然过期（当前无 Cache Purge 权限）。

---

## 5. 技术选型（已定调）

| 方向 | 选择 | 说明 |
|---|---|---|
| 现阶段 Web | 原生 HTML/CSS/JS，不引入重构建 | 保持线上稳定，**不推倒重写** |
| 跨端框架（未来） | **Taro 4 + React + TypeScript** | 一套业务核心出微信小程序 + H5(PWA)；理由见规范文档 |
| 状态 / 业务核心 | 框架无关的纯 JS/TS 模块 | 不绑定 React，便于在 vanilla 与 Taro 间复用 |
| 后端 | Cloudflare Worker + KV + TOS + 火山方舟 | 已上线，多端共用 |
| 对象存储 | 火山 TOS（预签名直传） | 上传接口端中立，Web / 小程序同一套 |
| PWA | Manifest + Service Worker + Web Push | 在 H5 上叠加，不另起站点 |

---

## 6. 产品与合规红线（开发必须知道）

- **全行业定位**：前台官网 / 工作台 / 视频 / 后台**不得出现**"只做二手 / 从某行业起步 / 行业模板 / 强制选品类"等口径；二手车是内置能力之一（自动匹配或下拉自选），不是产品边界。
- **不做 GEO**。
- **阿发半自动分发**：把"生成完毕 → 手指放在发送键上"之间的步骤全部自动化，**最后一下"发送"必须由用户本人完成**；不代发、不触碰用户账号密码、不索要平台 Cookie；IM / 媒体 OAuth 未接通前只能"登记 + 待开通"，不得谎称已授权。
- **能力不谎称**：依赖后端 / 资质未就绪的能力（如服务端脱敏、真实图生视频、各平台 OAuth、微信订阅消息），UI 标注"待开通 / 内测"，不做假按钮、假数据、假状态。
- AI 生成内容按规定带标识；合规能力以 `GET /config` 的 `capabilities` 为准，端侧不硬编码承诺。

---

## 7. 文档索引

| 文档 | 用途 |
|---|---|
| [`docs/多端开发规范.md`](docs/多端开发规范.md) | **工程宪法**：分层、适配层契约、跨端样式、登录 / 上传 / 路由 / 通知、注释标注、Checklist、迁移路线 |
| [`docs/API契约.md`](docs/API契约.md) | 多端统一 API 规范、统一包络 / 错误码 / 鉴权 / 上传 / 异步任务、现状路由盘点与中立化差距 |
| [`server-cloudflare/API-小程序端接口设计.md`](server-cloudflare/API-小程序端接口设计.md) | 早期 v1 契约（存档，已被 `docs/API契约.md` 升级取代） |
| [`DESIGN-GUIDELINES.md`](DESIGN-GUIDELINES.md) | 视觉与品牌设计规范 |
