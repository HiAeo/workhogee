#!/bin/bash
# WorkHogee AI 获客伙计 - 生产环境启动脚本
# 适用于 Linux/macOS 云服务器

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  WorkHogee AI 获客伙计 - 生产启动"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi
echo "✓ Node.js 版本: $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "错误: 未找到 npm"
    exit 1
fi

# 加载环境变量
if [ -f .env ]; then
    echo "✓ 加载 .env 环境变量"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠ 未找到 .env 文件，使用默认配置"
fi

# 安装依赖
echo ""
echo "安装依赖..."
npm install --production

# 创建数据目录
mkdir -p data

# 启动应用
echo ""
echo "启动 WorkHogee AI 获客伙计..."
echo "  环境: ${NODE_ENV:-production}"
echo "  端口: ${PORT:-3000}"
echo "  数据库: ${DATABASE_ENABLED:-false} (false=JSON文件存储)"
echo ""

# 使用 nohup 后台运行
if [ "$1" = "--daemon" ]; then
    nohup node src/app.js > workhogee.log 2>&1 &
    echo $! > workhogee.pid
    echo "✓ 已后台启动，PID: $(cat workhogee.pid)"
    echo "  日志文件: workhogee.log"
    echo "  停止命令: kill \$(cat workhogee.pid)"
else
    node src/app.js
fi
