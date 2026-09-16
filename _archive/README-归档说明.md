# WorkHogee 官网内容归档与复原说明

归档时间：2026-09-16
归档原因：官网对外定位收敛为单一产品 **WorkHogee 生图伙计 · 二手车行版**。原 AI 获客伙计、GEO 伙计、出海伙计、智能体开发伙计等产品的营销页与文档从官网下线（原 URL 不再可访问），但内容**完整保留在本目录，可一键复原**。

> 本目录名以下划线 `_archive` 开头。GitHub Pages（Jekyll 默认构建）**不会发布下划线开头的目录**：因此这些文件保存在 GitHub 仓库中、随时可取回，但线上访客无法通过网址访问，搜索引擎也不会收录。这正好实现“下线但不删除、可一键复原”。

## 一、文件映射表（原线上路径 → 归档文件）

| 原产品 / 内容 | 原路径（仓库根） | 归档文件（本目录） |
|---|---|---|
| **AI获客伙计**（旧官网首页） | `/index.html` | `_archive/ai-huoke-home.html` |
| **GEO伙计**（营销页） | `/geo.html` | `_archive/geo-huoji.html` |
| **出海伙计**（营销页） | `/global.html` | `_archive/global-huoji.html` |
| **智能体开发伙计**（营销页） | `/agent-builder.html` | `_archive/agent-builder-huoji.html` |
| 内部排期文档（从未上线） | `/产品状态盘点与开发排期.html` | `_archive/internal-roadmap.html` |

### docs 文档（原 `/docs/` 目录 → `_archive/docs/`）

| 原内容 | 原路径 | 归档文件 |
|---|---|---|
| AI获客伙计·文档首页 | `/docs/index.html` | `_archive/docs/ai-huoke-docs.html` |
| GEO 优化指南 | `/docs/geo-guide.html` | `_archive/docs/geo-guide.html` |
| GEO 伙计 P0 完成报告 | `/docs/GEO伙计特别版P0开发完成报告.html` | `_archive/docs/geo-p0-report.html` |
| 出海伙计 P0 完成报告 | `/docs/出海专版P0开发完成报告.html` | `_archive/docs/global-p0-report.html` |
| 出海资质申请指南 | `/docs/出海资质申请指南.html` | `_archive/docs/global-qualification.html` |
| 部署技术文档 | `/docs/deployment-guide.md` | `_archive/docs/deployment-guide.md` |

## 二、切换后保留在线的内容

- `/`（首页）＝ 二手车行生图伙计营销页（原 `huoer.html` 内容首页化）
- `/huoer-online.html` ＝ 生图 Web 工作台
- `/huoer.html`、`/huoer-v2.html`、`/huoer-dynamic.html`、`/huoer-download.html` ＝ 301 式即时跳转首页（兼容旧链接）
- `/terms.html`、`/privacy.html` ＝ 服务条款 / 隐私政策（已改写为生图产品语境）
- `/admin/` ＝ 管理后台（内部工具，不在对外导航中）

## 三、如何一键复原（恢复某个旧产品）

### 方式 A：本地一键复原全部旧版页面

在本目录右键“用 PowerShell 运行”，或在项目根目录执行：

```powershell
python "_archive\restore.py"
```

脚本会先把当前二手车首页快照保存到 `_archive/usedcar-home-snapshot.html`（防止误操作丢失现网版本），再把归档文件按上表复制回原路径。

### 方式 B：只恢复单个产品

直接把 `_archive` 下对应归档文件复制回仓库根目录、改回原文件名即可。例如恢复 GEO 伙计：

```
复制 _archive/geo-huoji.html  →  geo.html
```

### 复原到线上

本地复原后，需要把恢复的文件重新部署到 GitHub 仓库（Contents API 上传回原路径），GitHub Pages 会在 1–2 分钟内重新发布。需要时让我执行即可。

## 四、再次下线

复原后若要再次下线，反向操作：把原路径文件移回 `_archive/`（覆盖归档副本），并从仓库根目录删除该文件即可。归档文件本身无需改动。
