@echo off
REM WorkHogee AI 获客伙计 - Windows 生产环境启动脚本

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ========================================
echo   WorkHogee AI 获客伙计 - 生产启动
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do set NODE_VERSION=%%v
echo ✓ Node.js 版本: %NODE_VERSION%

REM 加载环境变量
if exist .env (
    echo ✓ 加载 .env 环境变量
    for /f "usebackq tokens=1,2 delims==" %%a in ("%~dp0.env") do (
        if not "%%a"=="" if not "%%a:~0,1%"=="#" (
            set %%a=%%b
        )
    )
) else (
    echo ⚠ 未找到 .env 文件，使用默认配置
)

REM 设置默认环境变量
if "%NODE_ENV%"=="" set NODE_ENV=production
if "%PORT%"=="" set PORT=3000
if "%HOST%"=="" set HOST=0.0.0.0

REM 安装依赖
echo.
echo 安装依赖...
call npm install --production

REM 创建数据目录
if not exist data mkdir data

REM 启动应用
echo.
echo 启动 WorkHogee AI 获客伙计...
echo   环境: %NODE_ENV%
echo   端口: %PORT%
echo   数据库: %DATABASE_ENABLED% (false=JSON文件存储)
echo.

if "%1"=="--daemon" (
    start "WorkHogee API" /min node src/app.js
    echo ✓ 已后台启动
    echo   查看任务管理器中的 node 进程
) else (
    node src/app.js
)

endlocal
