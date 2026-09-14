@echo off
chcp 65001 >nul
title WorkHogee 内网穿透快速启动

echo ========================================
echo   WorkHogee 内网穿透快速启动工具
echo ========================================
echo.

REM 检查后端服务是否运行
echo [1/3] 检查本地后端服务...
curl -s http://localhost:3000/api/health >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 本地后端服务未运行，正在启动...
    cd /d "%~dp0..\ai-agent"
    start "WorkHogee Backend" cmd /k "node src/app.js"
    echo [等待] 等待后端服务启动...
    timeout /t 5 /nobreak >nul
) else (
    echo [OK] 后端服务运行正常
)

echo.
echo [2/3] 检查 cpolar 是否安装...
where cpolar >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 cpolar
    echo.
    echo 请先下载安装 cpolar:
    echo   官网: https://www.cpolar.com
    echo   下载: https://www.cpolar.com/download
    echo.
    echo 安装后请重新运行此脚本
    pause
    exit /b 1
)
echo [OK] cpolar 已安装

echo.
echo [3/3] 启动内网穿透...
echo.
echo ========================================
echo   内网穿透启动中...
echo   本地地址: http://localhost:3000
echo.
echo   启动后请复制显示的公网地址
echo   格式如: https://xxx.cpolar.cn
echo.
echo   然后在管理后台 - 系统设置中
echo   配置 API 地址为: https://xxx.cpolar.cn/api
echo ========================================
echo.

cpolar http 3000

pause
