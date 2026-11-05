# 官网客服留言承接 · 本地运营操作手册（个人主体 / 单运营阶段）

访客在官网右下角 widget 发送的消息进入 Cloudflare D1（`workhogee-support`）。本目录脚本在**本机**通过已登录的 wrangler 完成"查看 / 导出 / 人工回复"，不开放任何公网管理入口、不引入新密钥。人工回复以 `role='bot'` 写回，访客再次打开 widget（或停留页面轮询）即可看到。

## 边界与安全

- 公网 `POST /api/support/message` 永远只写访客消息（`role='me'`），无法匿名伪造客服回复。
- 客服回复只能由本机脚本凭 wrangler OAuth 写入；脚本不读取 `server-cloudflare/.dev.vars`，也不需要任何额外令牌。
- `GET /api/support/history` 仍只回 `cid/role/text/ts` 四个字段，IP、UA、邮箱等隐私列只在本机脚本可见。
- 缺省操作**云端生产库**（`--remote`）；加 `--local` 仅操作本地 `pages dev` 模拟库，两套库互不影响。

## 前置

- Node ≥ 18（仓库已具备，无需额外 `npm install`，脚本只用内置模块）。
- wrangler 已通过 OAuth 登录且具备 D1 权限（#729 已完成）。
- 在仓库根目录 `workhogee/` 下执行命令。PowerShell 若显示中文乱码，先执行 `chcp 65001` 切换 UTF-8 代码页。

## 常用命令

### 1. 查看最近会话（云端）

```powershell
node scripts/support-inbox.mjs
```

按最后活跃倒序列出会话，标注每个会话的访客/客服消息数；有访客消息且尚无客服回复的会标记 `[待回复]`。

### 2. 查看某个会话的完整对话

```powershell
node scripts/support-inbox.mjs --sid <会话ID>
```

### 3. 人工回复

```powershell
# 短回复直接内联
node scripts/support-reply.mjs --sid <会话ID> --text "您好，已收到，我们工作日内会联系您。"

# 长文本 / 多行 / 含中文，推荐写入 UTF-8 文本文件后导入，规避命令行编码问题
node scripts/support-reply.mjs --sid <会话ID> --file reply.txt
```

脚本会先校验该会话真实存在，再写入一条客服消息并刷新会话的最后活跃时间。单条上限 2000 字，与前端一致。每条命令对应一条回复，请勿重复执行。

### 4. 导出全部留言为 CSV（Excel 可直接打开，UTF-8 BOM）

```powershell
# 自动生成到 scripts/exports/support-export-<时间戳>.csv
node scripts/support-inbox.mjs --csv

# 或指定路径
node scripts/support-inbox.mjs --csv .\support.csv
```

### 5. 本地联调（不碰生产数据）

```powershell
node scripts/support-inbox.mjs --local
node scripts/support-reply.mjs --local --sid <会话ID> --text "本地测试回复"
```

本地库数据文件位于 `.local-serve/state/`，由 `pages dev` 使用；云端库不会受到任何影响。

## 访客侧如何看到回复

- widget 在前台时每 10 秒轮询一次 `history`；页面切回前台或重新打开 widget 时立即拉取。
- 收到新的客服回复且 widget 处于关闭状态时，右下角气泡会出现红色未读圆点，打开后清除。
- 历史消息按 `cid` 去重合并，刷新页面 / 跨会话仍保持一致。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `support-lib.mjs` | 共享库：wrangler 定位与执行、参数解析、SQL 转义、时间/CSV 工具 |
| `support-inbox.mjs` | 会话列表、单会话详情、CSV 导出（只读） |
| `support-reply.mjs` | 人工回复写回（写 `role='bot'`） |
