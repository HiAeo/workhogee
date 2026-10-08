/**
 * WorkHogee PC 客户端预加载脚本
 * 在渲染进程中暴露安全的 API
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workhogee', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 显示桌面通知
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),

  // 最小化到托盘
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),

  // 用外部浏览器打开链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // 自动更新
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // 平台信息
  platform: process.platform,
  isElectron: true
});

// 监听来自主进程的消息
ipcRenderer.on('new-lead-notification', (event, data) => {
  if (window.workhogeeNotifications) {
    window.workhogeeNotifications.push(data);
  }
});

// 自动更新事件
ipcRenderer.on('update-available', (event, info) => {
  if (window.onUpdateAvailable) {
    window.onUpdateAvailable(info);
  }
});

ipcRenderer.on('download-progress', (event, progress) => {
  if (window.onDownloadProgress) {
    window.onDownloadProgress(progress);
  }
});

ipcRenderer.on('update-downloaded', (event, info) => {
  if (window.onUpdateDownloaded) {
    window.onUpdateDownloaded(info);
  }
});
