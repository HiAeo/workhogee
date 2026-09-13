/**
 * WorkHogee PC 客户端主进程
 * 基于 Electron 构建，集成 Web 管理后台
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const http = require('http');

// 配置
const CONFIG = {
  serverPort: 3000,
  serverUrl: 'http://localhost:3000',
  windowWidth: 1280,
  windowHeight: 800,
  minWidth: 1024,
  minHeight: 680
};

// 全局变量
let mainWindow = null;
let tray = null;
let isQuitting = false;

// ===== 应用单实例锁 =====
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ===== 创建主窗口 =====
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: CONFIG.windowWidth,
    height: CONFIG.windowHeight,
    minWidth: CONFIG.minWidth,
    minHeight: CONFIG.minHeight,
    title: 'WorkHogee AI 获客伙计',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#faf8f4'
  });

  // 加载本地服务
  mainWindow.loadURL(CONFIG.serverUrl);

  // 页面加载完成后显示
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
  });

  // 关闭时最小化到托盘（不退出）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      showTrayNotification('WorkHogee 已最小化到托盘', '程序仍在后台运行，新线索会及时通知您');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 外部链接用浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ===== 创建系统托盘 =====
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');

  try {
    tray = new Tray(iconPath);
  } catch (e) {
    // 如果图标加载失败，使用默认图标
    tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 WorkHogee',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: '新线索提醒',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        global.enableNotifications = menuItem.checked;
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('WorkHogee AI 获客伙计');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createMainWindow();
    }
  });
}

// ===== 桌面通知 =====
function showTrayNotification(title, body) {
  if (!global.enableNotifications) return;

  try {
    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, 'assets', 'icon.png'),
      silent: false
    });

    notification.show();

    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.error('通知失败:', e.message);
  }
}

// ===== 检查本地服务是否启动 =====
function checkServerReady() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: CONFIG.serverPort,
      path: '/api/health',
      method: 'GET',
      timeout: 2000
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// ===== 等待服务启动 =====
async function waitForServer(maxRetries = 30, interval = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    const ready = await checkServerReady();
    if (ready) return true;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

// ===== IPC 通信 =====
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-notification', (event, { title, body }) => {
  showTrayNotification(title, body);
  return true;
});

ipcMain.handle('minimize-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  return true;
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return true;
});

// ===== 应用生命周期 =====
app.whenReady().then(async () => {
  console.log('WorkHogee 客户端启动中...');

  // 启用通知
  global.enableNotifications = true;

  // 创建托盘
  createTray();

  // 等待本地服务启动
  const serverReady = await waitForServer();

  if (!serverReady) {
    console.warn('本地服务未检测到，将直接加载页面（可能需要手动启动服务）');
  }

  // 创建主窗口
  createMainWindow();

  // macOS 特有
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  console.log('WorkHogee 客户端已启动');
});

app.on('window-all-closed', () => {
  // Windows/Linux 关闭所有窗口时不退出（保持托盘运行）
  if (process.platform !== 'darwin') {
    // 不调用 app.quit()，保持托盘运行
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ===== 全局异常处理 =====
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
});
