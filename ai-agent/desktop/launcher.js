/**
 * WorkHogee PC 客户端启动脚本
 * 同时启动后端服务和 Electron 客户端
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const http = require('http');

const SERVER_PORT = 3000;
const SERVER_PATH = path.join(__dirname, '..', 'src', 'app.js');

let serverProcess = null;

// 检查端口是否被占用
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port,
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

// 启动后端服务
async function startServer() {
  const portInUse = await checkPortInUse(SERVER_PORT);

  if (portInUse) {
    console.log(`[启动器] 后端服务已在端口 ${SERVER_PORT} 运行，跳过启动`);
    return true;
  }

  console.log('[启动器] 正在启动后端服务...');

  serverProcess = spawn('node', [SERVER_PATH], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  serverProcess.on('error', (err) => {
    console.error('[启动器] 后端服务启动失败:', err.message);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[启动器] 后端服务已退出 (code: ${code})`);
  });

  // 等待服务启动
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const ready = await checkPortInUse(SERVER_PORT);
    if (ready) {
      console.log('[启动器] 后端服务已启动');
      return true;
    }
  }

  console.warn('[启动器] 后端服务启动超时，但继续启动客户端');
  return false;
}

// 启动 Electron 客户端
function startElectron() {
  console.log('[启动器] 正在启动客户端...');

  const electronPath = require('electron');
  const electronProcess = spawn(electronPath, ['.'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  electronProcess.on('error', (err) => {
    console.error('[启动器] 客户端启动失败:', err.message);
  });

  electronProcess.on('exit', (code) => {
    console.log(`[启动器] 客户端已退出 (code: ${code})`);
    // 客户端退出时，关闭后端服务
    if (serverProcess) {
      serverProcess.kill();
    }
    process.exit(code);
  });
}

// 主流程
async function main() {
  console.log('========================================');
  console.log('  WorkHogee AI 获客伙计 - 启动器');
  console.log('========================================\n');

  await startServer();
  startElectron();
}

main().catch(console.error);
