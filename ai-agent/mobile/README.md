# WorkHogee AI 获客伙计 - 移动端 APP

基于 React Native + Expo 开发的跨平台移动端应用，支持 iOS 和 Android。

## 功能特性

### 核心功能
- **首页仪表盘** - 数据概览、快捷操作、最新线索
- **线索管理** - 线索列表、搜索筛选、详情查看、状态更新、新建线索
- **智能对话** - 与 AI 获客伙计实时对话、快捷回复、对话历史
- **通知中心** - 新线索、新对话、新邮件、跟进提醒等通知
- **日报周报** - 自动生成日报/周报、关键指标、意向分布、渠道分析
- **知识库** - 产品资料、FAQ、话术库管理与搜索
- **邮箱渠道** - 邮箱账户管理、邮件接收、AI 询盘识别、智能回复
- **个人中心** - 用户信息、数据概览、系统设置

### 技术栈
- **框架**: React Native 0.73 + Expo SDK 50
- **导航**: React Navigation 6 (Stack + Bottom Tabs)
- **状态管理**: Zustand
- **网络请求**: Axios
- **本地存储**: AsyncStorage + SecureStore
- **UI 组件**: 自定义组件库
- **推送通知**: Expo Notifications

## 项目结构

```
mobile/
├── App.js                    # 应用入口
├── app.json                  # Expo 配置
├── package.json              # 依赖配置
├── babel.config.js           # Babel 配置
├── jsconfig.json             # JS 路径别名配置
├── index.js                  # 注册入口
├── assets/                   # 静态资源（图标、启动页等）
└── src/
    ├── components/           # 通用 UI 组件
    │   └── index.js          # Button, Card, Tag, EmptyState, Loading 等
    ├── navigation/           # 导航系统
    │   └── AppNavigator.js   # 根导航配置
    ├── screens/              # 页面组件
    │   ├── SplashScreen.js       # 启动页
    │   ├── LoginScreen.js        # 登录页
    │   ├── HomeScreen.js         # 首页仪表盘
    │   ├── LeadsScreen.js        # 线索列表
    │   ├── LeadDetailScreen.js   # 线索详情
    │   ├── CreateLeadScreen.js   # 新建线索
    │   ├── ConversationScreen.js # 对话列表
    │   ├── ChatScreen.js         # 聊天页面
    │   ├── NotificationsScreen.js# 通知中心
    │   ├── ProfileScreen.js      # 个人中心
    │   ├── ReportsScreen.js      # 日报周报列表
    │   ├── ReportDetailScreen.js # 报告详情
    │   ├── KnowledgeScreen.js    # 知识库
    │   ├── EmailScreen.js        # 邮箱渠道
    │   ├── EmailDetailScreen.js  # 邮件详情
    │   └── SettingsScreen.js     # 设置页
    ├── services/             # API 服务
    │   └── api.js              # REST API 封装（13个模块）
    ├── store/                # 状态管理
    │   └── index.js            # Auth, Lead, Notification, App 四个 store
    ├── theme/                # 主题配置
    │   └── index.js            # 颜色、间距、字号、圆角、阴影
    └── utils/                # 工具函数
        └── index.js            # 日期格式化、脱敏、验证等
```

## 快速开始

### 环境要求
- Node.js >= 18
- npm 或 yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS 开发需要 macOS + Xcode
- Android 开发需要 Android Studio

### 安装依赖

```bash
cd mobile
npm install
```

### 配置 API 地址

编辑 `app.json` 中的 `extra.apiBaseUrl`：

```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "http://your-server:3000/api"
    }
  }
}
```

### 启动开发服务器

```bash
# 启动 Expo 开发服务器
npm start

# 或直接启动特定平台
npm run android   # Android
npm run ios       # iOS (需要 macOS)
npm run web       # Web 版本
```

### 构建生产版本

```bash
# Android APK/AAB
expo build:android

# iOS IPA
expo build:ios

# 使用 EAS Build (推荐)
eas build --platform android
eas build --platform ios
eas build --platform all
```

## API 模块说明

| 模块 | 功能 | 主要端点 |
|------|------|----------|
| auth | 认证 | login, register, profile |
| lead | 线索管理 | list, get, create, update, delete, stats |
| conversation | 对话 | list, get, create, sendMessage, analyze |
| notification | 通知 | list, markAsRead, markAllAsRead, unreadCount |
| report | 报告 | list, get, generate, latest |
| knowledge | 知识库 | list, get, create, search, stats, categories |
| email | 邮箱渠道 | accounts, emails, drafts, templates, send |
| content | 内容智造 | xiaohongshu, article, copy, calendar |
| nurture | 线索培育 | followUp, content, plan, pending, result |
| profile | 客户画像 | get, update, tags |
| analytics | 数据分析 | dashboard, funnel, channels, intention |
| system | 系统 | health, config, version |

## 主题配置

品牌色与官网保持一致：

| 颜色 | 色值 | 用途 |
|------|------|------|
| 品牌橙 | `#ea580c` | 主色、按钮、强调 |
| 深橙 | `#c2410c` | 按下状态 |
| 浅橙 | `#fb923c` | 渐变、背景 |
| 深墨 | `#1c1917` | 标题、正文 |
| 纸色 | `#faf8f4` | 页面背景 |
| 沙色 | `#f0e9db` | 分割线、卡片边框 |

## 状态管理

使用 Zustand 进行状态管理，共 4 个 store：

1. **useAuthStore** - 用户认证状态（登录、登出、用户信息）
2. **useLeadStore** - 线索数据（列表、详情、筛选、分页）
3. **useNotificationStore** - 通知数据（列表、未读数量、标记已读）
4. **useAppStore** - 应用配置（深色模式、语言、API 地址）

## 注意事项

1. **首次登录** - 需要后端服务已启动并可访问
2. **推送通知** - 需要配置 Expo Push Token 和后端推送服务
3. **图片资源** - `assets/` 目录需要添加应用图标和启动页图片
4. **生产环境** - 建议使用 EAS Build 进行构建和分发
5. **API 地址** - 生产环境请使用 HTTPS 协议的公网地址

## 后续开发计划

- [ ] 推送通知集成（Expo Push）
- [ ] 离线数据缓存
- [ ] 生物识别登录（指纹/面容）
- [ ] 多语言支持
- [ ] 深色模式完善
- [ ] 通话录音与纪要
- [ ] 小红书/抖音渠道接入
- [ ] 客户画像可视化
- [ ] 数据导出功能
- [ ] 应用内更新检测

## 相关文档

- [React Native 文档](https://reactnative.dev/docs/getting-started)
- [Expo 文档](https://docs.expo.dev/)
- [React Navigation 文档](https://reactnavigation.org/docs/getting-started)
- [Zustand 文档](https://docs.pmnd.rs/zustand/getting-started/introduction)

---

© 2026 WorkHogee. All rights reserved.
