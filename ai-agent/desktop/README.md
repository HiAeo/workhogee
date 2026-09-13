# WorkHogee PC 客户端

基于 Electron 构建的桌面客户端，集成 Web 管理后台，支持系统托盘、桌面通知、开机自启等功能。

## 功能特性

- 🖥️ **桌面客户端** - 独立窗口运行，不依赖浏览器
- 🔔 **桌面通知** - 新线索到达时实时弹窗提醒
- 📥 **系统托盘** - 最小化到后台运行，不占任务栏
- 🔄 **自动启动服务** - 启动器自动检测并启动后端服务
- 🌐 **外部链接** - 外部链接自动用系统浏览器打开
- 🚀 **单实例锁** - 防止重复启动多个客户端

## 目录结构

```
desktop/
├── package.json      # 客户端依赖配置
├── main.js           # Electron 主进程
├── preload.js        # 预加载脚本（安全 API 暴露）
├── launcher.js       # 启动器（同时启动服务+客户端）
├── start.bat         # Windows 一键启动脚本
├── assets/           # 图标资源
│   ├── icon.png      # 应用图标
│   ├── icon.ico      # Windows 图标
│   └── tray-icon.png # 托盘图标
└── README.md         # 本文档
```

## 快速开始

### 方式一：使用启动器（推荐）

```bash
cd desktop
node launcher.js
```

启动器会自动：
1. 检测后端服务是否已启动
2. 如果未启动，自动启动后端服务
3. 等待服务就绪后启动 Electron 客户端

### 方式二：Windows 一键启动

双击 `start.bat` 即可启动。

### 方式三：手动启动

```bash
# 1. 先启动后端服务（在 ai-agent 目录下）
cd ..
node src/app.js

# 2. 再启动客户端
cd desktop
npx electron .
```

## 安装依赖

首次使用需要安装 Electron 依赖：

```bash
cd desktop
npm install
```

## 打包发布

### Windows 安装包

```bash
cd desktop
npm run build:win
```

生成的安装包在 `dist/` 目录下。

### macOS 安装包

```bash
cd desktop
npm run build:mac
```

## 配置说明

在 `main.js` 中可以修改以下配置：

```javascript
const CONFIG = {
  serverPort: 3000,        // 后端服务端口
  serverUrl: 'http://localhost:3000',  // 服务地址
  windowWidth: 1280,       // 窗口默认宽度
  windowHeight: 800,        // 窗口默认高度
  minWidth: 1024,           // 最小宽度
  minHeight: 680            // 最小高度
};
```

## 前端 API

在 Web 页面中可以通过 `window.workhogee` 调用客户端能力：

```javascript
// 显示桌面通知
window.workhogee.showNotification('新线索', '张三 - 高意向客户');

// 最小化到托盘
window.workhogee.minimizeToTray();

// 用外部浏览器打开链接
window.workhogee.openExternal('https://example.com');

// 获取应用版本
const version = await window.workhogee.getAppVersion();

// 判断是否在 Electron 环境
if (window.workhogee?.isElectron) {
  // 客户端特有逻辑
}
```

## 注意事项

1. 客户端依赖后端服务运行，如果服务未启动，页面会无法加载
2. 关闭窗口时默认最小化到托盘，如需完全退出请右键托盘图标选择"退出"
3. 首次启动需要安装 Electron 依赖（约 100MB）
4. 打包后的安装包约 80-100MB
