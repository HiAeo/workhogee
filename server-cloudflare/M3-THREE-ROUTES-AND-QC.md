# M3 后端改造说明：三条生产路线 + fidelity-qc 质检门禁 + Ark key 修复

> 部署版本：Cloudflare Worker `workhogee-image-api`，Version `54d002e3-0b62-46cf-8b9e-53db29a5cd70`
> 线上：https://api.workhogee.com  ；`GET /health` 返回 `{"ok":true,"status":"healthy"}`。

## 1. 改了哪些文件

| 文件 | 改动 |
|------|------|
| `m23-job.js` | job 引擎：step 编排改为 `script → cutout → qc → sceneRbg → marketingRbg → copy`；新增 `stepSceneRbg`/`stepMarketingRbg` 替换旧 `stepScene`/`stepMarketing`；重写 `stepQc` 为白底硬门禁；新增 prompt 构建器 `buildSceneRbgPrompt`/`buildMarketingRbgPrompt` 与 `downloadCutoutBytes`；`getJob` 在 `whitebgBlocked` 时扣留 `cutoutUrl`。 |
| `picwish.js` | 新增 `picwishRBackground(env, pngBytes, prompt)`：POST `/api/tasks/visual/r-background`，multipart 上传透明 PNG + 英文 prompt + sync=1，解析 `data.image_1..image_4` 返回非空候选 URL 数组（最多 4）。 |
| `png-qc.js` | **新增模块**。Worker 端无 Canvas/PIL，用 `DecompressionStream('deflate')` 解 PNG zlib IDAT + 逐行 unfilter，仅支持 8-bit RGBA（PicWish 抠图实际格式）。导出 `checkWhiteBackground(pngBytes)`：6 个角落/边中点 alpha 采样（合成白底后是否 #FFFFFF）+ 全图不透明像素占比（简化 IoU）。 |
| `.dev.vars`（不入库） | 旧 key `ark-9296b9ea-…` 已注销（401）；改直连 key + 模型名 `doubao-seedream-4-5-251128`。 |
| `wrangler.toml` | 无代码改动（早已配置 `ARK_MODEL=doubao-seedream-4-5-251128` 直连）。 |

旧 `stepScene`/`stepMarketing`（Seedream 空背景/营销图）已被 rbg 路线取代；`seedreamTextGenUrl` 保留为直连备选，不在默认 pipeline 路径上。

## 2. 三条生产路线

| 路线 | 后端做什么 | 前端做什么 |
|------|-----------|-----------|
| **白底产品图** | cutout（PicWish segmentation）输出透明 PNG 到 TOS；stepQc 硬门禁通过后返回 `cutoutUrl`。后端不精修。 | Canvas 精修：白平衡/对比/阴影/去色边/锐化/玻璃高光，合成白底。 |
| **场景图** `sceneRbg` | 下载透明 PNG → r-background 联合生成（产品+场景一体，不贴回）；一次返回最多 4 候选，取前 3 张转存 TOS → `sceneUrls[]`。 | 直接展示，不再贴回。 |
| **营销海报** `marketingRbg` | r-background 生成「干净背景+产品、无烧录文字」底图 → `marketingUrl`。 | Canvas 独立叠加标题/卖点/图标文字层。 |

`stepCopy` 不变，输出 `results.copy`（标题/卖点/描述/渠道文案）供前端文字层使用。

## 3. fidelity-qc 质检门禁

**白底（硬门禁，在 cutout 之后立即执行）：**
- `bgWhite`：6 个采样点（四角+上下边中点）块内 alpha 全 0 占比 ≥0.9 —— 合成白底后角落才是 #FFFFFF。
- `opaqueRatio`：主体不透明像素占比在 3%~95%（简化 IoU，防漏抠/防背景没抠掉）。
- 视觉闸（best-effort）：`checkCutoutQuality` 评 `consistency≥0.85`、`edgeCleanliness≥0.8`；视觉不可用时不拦。
- 不达标 → `results.qcFailed={route:'whitebg',reasons}` + `whitebgBlocked=true`，`cutoutUrl` 置 null（前端拿不到白底图）；scene/marketing 仍用 `cutoutKey` 继续跑。

**场景（best-effort）：** 以 prompt 负向约束为主（`no text/no watermark/no distorted props/no duplicate product`）；实测候选背景道具上仍可能出现 AI 幻觉文字，后续按人工抽检 + 视觉 OCR 兜底。

## 4. API 契约（job results 新增/变化字段）

```
results.cutoutUrl        string|null  // 白底路线；whitebgBlocked 时为 null
results.whitebgBlocked   bool         // 白底质检是否被拦
results.qcFailed          {route,reasons,at}|undefined
results.qualityCheck      {passed, route, deterministic:{bgWhiteRatio,opaqueRatio,...}, vision:{scores,issues}, reasons}
results.sceneMode         "rbg_integrated"
results.sceneUrls         [string|null,string|null,string|null]  // rbg 联合生成候选
results.marketingMode     "rbg_background_frontend_text"
results.marketingUrl      string|null
results.copy             {title, sellingPoints[], description, channels{...}}
```
`sceneKeys/sceneSeedUrls/marketingKey` 为内部字段，对外 URL 由 `refreshOutputUrls` 预签名刷新。

## 5. Ark key 排查结论（403 根因）

- 旧本地 key `ark-9296b9ea-…`：**已注销**，任何调用都 401 `The API key doesn't exist`。
- 接入点 `ep-m-20260915134242-p4rpr` 报 **403**（已认证但无权限）= 该推理接入点在账号下**未发布/未绑定 Seedream 模型/或 key 未被授权该接入点**。
- **解法：模型名直连**。`POST ark.cn-beijing.volces.com/api/v3/images/generations`，`model=doubao-seedream-4-5-251128`，同 key 对 `chat/completions` 的 `doubao-seed-2-1-turbo-260628`（脚本/文案/质检）也鉴权通过。
- 已把生产 secret `ARK_API_KEY` 轮换为直连可用 key（`wrangler secret put`）；本地 `.dev.vars` 同步更新。
- **需用户在方舟控制台确认（未代操作）**：若以后想恢复用接入点，需在方舟控制台「推理接入点」发布 `ep-m-20260915134242-p4rpr`、确认绑定了 Seedream 模型、并给所用 API Key 授予该接入点权限。当前直连路径不依赖它。

## 6. 验证结果

- `node --check m23-job.js / worker.js / picwish.js / png-qc.js` 全部通过。
- `png-qc` 单测：真抠图（beauty/food cutout）`bgWhiteRatio=1.0` 通过；合成白底图（无 alpha）正确拦截。
- r-background 实调（唇釉）：9.2s 返回 2 候选，产品形状/颜色保真、接触阴影自然、无产品文字。
- 线上端到端（beauty_orig.jpg）：6 步全 done、无 error；cutoutUrl 输出、QC 通过（bgWhiteRatio=1.0、vision consistency=1/edge=0.95）、sceneUrls 2 张、marketingUrl、copy 齐全。
- PicWish 额度：包月 2500 算粒（至 2026-10-28），抠图 0.5/张、r-background 3/张。A/B/C 40 张全量回归待 prompt 定稿后跑。
