# WorkHogee AI 获客伙计 v0.5.0

基于 DeepSeek Harness 理念构建的智能获客 Agent，帮助中小企业实现从流量到客户的全链路自动化获客。

## v0.5.0 新增功能

### 邮箱渠道全链路接入
- **邮箱配置管理**：支持多邮箱账户配置，IMAP/SMTP 连接测试，自动回复开关
- **邮件接收与询盘识别**：自动接收邮件，AI 识别询盘邮件，自动创建线索
- **邮件自动回复与发送**：AI 生成个性化回复，草稿审核机制，已发送邮件管理
- **回复模板管理**：常用回复模板，支持分类和使用统计

### v0.4.0 新增功能

### 主动学习引擎
- **知识库服务**：产品资料/FAQ/话术库管理，AI 智能检索，使用次数统计
- **文档管理**：产品资料的增删改查，分类管理，关键词检索
- **FAQ 管理**：常见问题管理，AI 自动匹配答案
- **话术库管理**：销售话术管理，按场景分类

### 日报/周报自动生成
- **自动生成报告**：基于线索/对话/邮件数据自动生成日报/周报
- **关键指标统计**：新增线索/已转化/对话数/邮件数等核心指标
- **AI 优化建议**：基于数据分析给出获客优化建议
- **报告历史管理**：报告列表查看，详情展示

### PC 客户端（Electron）
- **桌面客户端**：基于 Electron 的跨平台桌面应用
- **系统托盘**：最小化到托盘，后台运行
- **桌面通知**：新线索/新邮件桌面通知
- **自动更新**：支持应用自动更新（electron-updater）
- **单实例锁**：防止多开
- **启动器**：一键启动后端服务+客户端

### v0.3.0 新增功能

### 企业级功能
- **数据导出**：支持线索数据 CSV 导出，含 BOM 支持 Excel 中文
- **API Key 认证**：完整的 API Key 管理系统，支持生成/撤销/权限控制/调用日志
- **实时通知系统**：新线索到达自动通知，支持系统通知/Webhook/邮件，可配置通知规则
- **多租户支持**：基础版多租户架构，支持租户隔离/独立配置/API Key 管理
- **日志系统**：完整的日志记录与查询，支持按级别/日期/关键词筛选，自动轮转
- **缓存系统**：LLM 响应缓存与数据查询缓存，支持 TTL/命中率统计/内存管理

### 数据分析与优化
- **对话质量分析**：综合分析报告，含转化漏斗/意向分布/来源分析/7天趋势/优化建议
- **A/B 测试框架**：支持欢迎语/话术/内容的 A/B 测试，自动统计转化率，统计显著性检测，自动推荐最优版本
- **客户画像系统**：基于对话内容 AI 生成客户画像，含性格特征/痛点/需求/兴趣/购买阶段/智能标签

## 核心能力

### 智能承接（Smart Intake）
- **智能对话承接**：24小时在线接待客户咨询，友好专业
- **意向等级判定**：自动分析客户意向，分为 A/B/C 三级
- **资格筛选**：自动识别客户预算、决策周期、是否决策人
- **线索自动记录**：对话中自动提取客户信息，创建线索
- **预约引导**：高意向客户自动引导预约到店/演示

### 内容智造（Content Creator）
- **小红书图文笔记**：自动生成爆款笔记，含标题/正文/配图建议/标签
- **公众号文章**：深度好文生成，含标题/摘要/正文/金句/互动话题
- **营销文案**：多场景文案生成，支持朋友圈/广告/短信/邮件
- **内容日历**：一周内容规划，含主题/形式/平台/要点/目标

### 线索培育（Lead Nurture）
- **个性化跟进话术**：按场景生成（首次跟进/二次跟进/逼单/唤醒/节日问候）
- **培育内容生成**：产品资料/客户案例/行业报告/优惠信息
- **跟进计划 SOP**：根据意向等级制定个性化跟进频率和触达节点
- **待跟进提醒**：自动识别超过 N 天未跟进的线索
- **跟进结果记录**：自动更新线索状态和意向等级

## DSH 插件系统

基于 DeepSeek Harness 理念的插件化架构，所有能力均以插件形式提供：

- **workhogee-smart-intake**：智能承接插件
- **workhogee-content-creator**：内容智造插件
- **workhogee-lead-nurture**：线索培育插件

插件系统已注册 3 个技能、11 个工具，支持能力扩展和第三方插件接入。

## 技术架构

```
┌─────────────────────────────────────────┐
│           Web 管理后台 (前端)            │
├─────────────────────────────────────────┤
│           Express API 服务层             │
├──────────────┬──────────────────────────┤
│  智能承接技能  │    线索/对话存储服务     │
│  内容智造技能  │   (Lead/Conversation)  │
│  线索培育技能  │                          │
├──────────────┴──────────────────────────┤
│        LLM 服务 (DeepSeek API)          │
├─────────────────────────────────────────┤
│     DSH 插件系统 (DeepSeek Harness)     │
│  3个插件 · 3个技能 · 11个工具           │
└─────────────────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd ai-agent
npm install
```

### 2. 配置 API Key

编辑 `config/default.json`，填入你的 DeepSeek API Key：

```json
{
  "llm": {
    "apiKey": "your-deepseek-api-key-here",
    "model": "deepseek-chat"
  }
}
```

### 3. 配置业务信息

在 `config/default.json` 中配置你的业务信息：

```json
{
  "business": {
    "industry": "教育",
    "product": "雅思培训课程",
    "targetCustomer": "25-35岁有出国意向的职场人士"
  }
}
```

### 4. 启动服务

```bash
npm start
```

服务启动后：
- 管理后台：http://localhost:3000
- API 健康检查：http://localhost:3000/api/health

## API 文档

### 对话相关
- `GET /api/conversations` - 获取对话记录列表（支持筛选和分页）
- `POST /api/conversations` - 开始新对话
- `POST /api/conversations/:id/messages` - 发送消息
- `GET /api/conversations/:id` - 获取对话历史
- `POST /api/conversations/:id/end` - 结束对话

### 线索相关
- `GET /api/leads` - 获取线索列表（支持筛选和分页）
- `GET /api/leads/:id` - 获取线索详情
- `POST /api/leads` - 创建线索
- `PUT /api/leads/:id` - 更新线索
- `POST /api/leads/:id/convert` - 标记线索已转化
- `GET /api/leads/to-followup` - 获取待跟进线索

### 内容智造
- `POST /api/content/xiaohongshu` - 生成小红书笔记
- `POST /api/content/wechat` - 生成公众号文章
- `POST /api/content/copy` - 生成营销文案
- `POST /api/content/calendar` - 生成内容日历

### 线索培育
- `POST /api/nurture/followup-script` - 生成跟进话术
- `POST /api/nurture/content` - 生成培育内容
- `POST /api/nurture/followup-plan` - 生成跟进计划
- `GET /api/nurture/pending` - 获取待跟进列表

### 邮箱渠道
- `GET /api/email/accounts` - 获取邮箱账户列表
- `POST /api/email/accounts` - 添加邮箱账户
- `GET /api/email/accounts/:id` - 获取邮箱账户详情
- `PUT /api/email/accounts/:id` - 更新邮箱账户
- `DELETE /api/email/accounts/:id` - 删除邮箱账户
- `POST /api/email/accounts/:id/test` - 测试邮箱连接
- `GET /api/email/receiver/emails` - 获取收件箱邮件
- `GET /api/email/receiver/emails/:id` - 获取邮件详情
- `POST /api/email/receiver/check-all` - 检查所有邮箱新邮件
- `POST /api/email/sender/generate-reply/:emailId` - AI 生成邮件回复
- `GET /api/email/sender/drafts` - 获取草稿列表
- `POST /api/email/sender/drafts/:id/approve-send` - 审核通过并发送
- `GET /api/email/sender/sent` - 获取已发送邮件
- `GET /api/email/sender/templates` - 获取回复模板

### 知识库
- `GET /api/knowledge` - 获取知识库统一列表（支持分类和搜索）
- `GET /api/knowledge/documents` - 获取产品资料列表
- `POST /api/knowledge/documents` - 添加产品资料
- `GET /api/knowledge/faqs` - 获取FAQ列表
- `POST /api/knowledge/faqs` - 添加FAQ
- `GET /api/knowledge/scripts` - 获取话术库列表
- `POST /api/knowledge/scripts` - 添加话术
- `POST /api/knowledge/reply` - AI 智能回复
- `GET /api/knowledge/stats` - 获取知识库统计

### 日报周报
- `GET /api/reports` - 获取报告列表（支持类型筛选）
- `GET /api/reports/:id` - 获取报告详情
- `POST /api/reports/generate` - 生成日报/周报

### 客户画像
- `GET /api/profiles` - 获取客户画像列表（支持意向等级筛选）
- `GET /api/profiles/:leadId` - 获取客户画像详情
- `POST /api/profiles/:leadId/generate` - AI 生成客户画像
- `PUT /api/profiles/:leadId` - 更新客户画像
- `POST /api/profiles/:leadId/tags` - 添加标签
- `DELETE /api/profiles/:leadId/tags/:tag` - 删除标签

### 数据分析
- `GET /api/stats` - 获取统计数据
- `GET /api/analytics/dashboard` - 获取仪表盘数据
- `GET /api/analytics/funnel` - 获取转化漏斗数据
- `GET /api/analytics/trend` - 获取趋势数据
- `GET /api/analytics/channels` - 获取渠道分析数据

### 系统管理
- `GET /api/health` - 健康检查
- `GET /api/export/leads` - 导出线索数据
- `GET /api/auth/keys` - 获取API Key列表
- `POST /api/auth/keys` - 生成API Key
- `DELETE /api/auth/keys/:id` - 撤销API Key
- `GET /api/notifications` - 获取通知列表
- `POST /api/notifications/:id/read` - 标记通知已读
- `GET /api/abtest/tests` - 获取A/B测试列表
- `POST /api/abtest/tests` - 创建A/B测试

## 项目结构

```
ai-agent/
├── config/
│   └── default.json          # 配置文件
├── src/
│   ├── app.js                 # 应用入口
│   ├── models/
│   │   ├── lead.js            # 线索数据模型
│   │   └── conversation.js    # 对话记录模型
│   ├── services/
│   │   ├── llm.js             # LLM API 服务
│   │   ├── leadService.js     # 线索存储服务
│   │   └── conversationService.js  # 对话存储服务
│   ├── skills/
│   │   └── smart-intake/
│   │       └── index.js       # 智能承接技能（核心业务逻辑）
│   ├── plugins/
│   │   ├── lead-storage/      # 线索存储插件（后续 DSH 集成）
│   │   └── web-chat/          # 网页对话插件（后续 DSH 集成）
│   └── routes/
│       └── api.js             # API 路由
├── web/
│   ├── index.html             # 管理后台页面
│   ├── css/
│   │   └── style.css          # 样式
│   └── js/
│       └── app.js             # 前端逻辑
├── data/
│   ├── leads/                 # 线索数据存储
│   └── conversations/         # 对话记录存储
├── tests/
│   └── test.js                # 测试脚本
├── package.json
└── README.md
```

## 后续规划

### Phase 1: MVP（当前）
- ✅ 智能对话承接
- ✅ 意向等级判定
- ✅ 资格筛选
- ✅ 线索自动记录
- ✅ Web 管理后台

### Phase 2: 能力扩展
- 内容智造技能（小红书/公众号内容生成）
- 线索培育技能（个性化跟进 SOP）
- 全渠触达（多平台消息发送）

### Phase 3: 数据飞轮
- 成交回传广告平台
- ROI 全链路归因
- 模型自优化

### Phase 4: DSH 深度集成
- 封装为 DSH 插件包
- 支持多模型切换
- 子代理编排
- 插件市场分发

## 技术栈

- **后端**：Node.js + Express
- **AI 模型**：DeepSeek API（deepseek-chat / deepseek-reasoner）
- **Web 管理后台**：原生 HTML/CSS/JS（单页应用）
- **PC 客户端**：Electron（支持 Windows/macOS/Linux）
- **移动端 APP**：React Native + Expo（支持 iOS/Android）
- **存储**：文件系统 JSON（后续可升级为 SQLite/PostgreSQL）
- **Agent 框架**：DeepSeek Harness 理念（插件化架构）
- **自动更新**：electron-updater（PC 客户端）

## 多端产品矩阵

| 产品 | 技术栈 | 状态 | 说明 |
|------|--------|------|------|
| Web 管理后台 | HTML/CSS/JS | ✅ 已完成 | 浏览器访问，功能最全 |
| PC 客户端 | Electron | ✅ 已完成 | 桌面应用，托盘运行，桌面通知 |
| 移动端 APP | React Native + Expo | ✅ 框架完成 | iOS/Android 双端，16个核心页面 |
| 官网展示页 | HTML/CSS/JS | ✅ 已完成 | www.workhogee.com |
| 可嵌入对话组件 | JS Widget | ✅ 已完成 | 一行代码嵌入客户官网 |

## 许可证

MIT
