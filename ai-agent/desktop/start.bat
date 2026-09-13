@echo off
chcp 65001 >nul
title WorkHogee AI 获客伙计

echo ========================================
echo   WorkHogee AI 获客伙计 - 启动器
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 检查后端服务...
node -e "const http=require('http');const req=http.request({hostname:'localhost',port:3000,path:'/api/health',timeout:2000},r=>{process.exit(r.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.on('timeout',()=>{req.destroy();process.exit(1)});req.end()" 2>nul

if %errorlevel%==0 (
    echo 后端服务已在运行
) else (
    echo 正在启动后端服务...
    start "WorkHogee Server" /min node ..\src\app.js
    timeout /t 3 /nobreak >nul
)

echo.
echo [2/2] 启动客户端...
echo.

npx electron .

echo.
echo 客户端已退出
pause
