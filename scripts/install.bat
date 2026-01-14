@echo off
chcp 65001 >nul 2>&1
title Start Project - Windows 一键安装

echo.
echo ╔════════════════════════════════════════════════════╗
echo ║   Start Project - Windows 一键安装脚本             ║
echo ╚════════════════════════════════════════════════════╝
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 未检测到 Node.js
    echo [*] 正在打开 Node.js 下载页面...
    start https://nodejs.org/
    echo.
    echo 请安装 Node.js 后重新运行此脚本
    pause
    exit /b 1
)
echo [√] Node.js 已安装

:: 检查 Docker
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 未检测到 Docker
    echo [*] 正在打开 Docker Desktop 下载页面...
    start https://www.docker.com/products/docker-desktop/
    echo.
    echo 请安装 Docker Desktop 后重新运行此脚本
    pause
    exit /b 1
)
echo [√] Docker 已安装

:: 检查 Docker 是否运行
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Docker 未运行，请启动 Docker Desktop
    echo [*] 正在尝试启动 Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo.
    echo 请等待 Docker 启动后重新运行此脚本
    pause
    exit /b 1
)
echo [√] Docker 已运行

:: 检查 Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 未检测到 Git
    echo [*] 正在打开 Git 下载页面...
    start https://git-scm.com/download/win
    echo.
    echo 请安装 Git 后重新运行此脚本
    pause
    exit /b 1
)
echo [√] Git 已安装

echo.
echo [1/5] 克隆项目...
cd /d "%USERPROFILE%"
if exist "start" (
    echo [*] 项目已存在，更新代码...
    cd start
    git pull
) else (
    git clone https://github.com/LZZLHY/start.git
    cd start
)

echo.
echo [2/5] 启动数据库...
docker compose up -d

echo.
echo [3/5] 配置后端...
cd backend
if not exist "env.local" (
    copy env.example env.local
    
    :: 生成随机 JWT_SECRET（使用 PowerShell）
    for /f "delims=" %%i in ('powershell -Command "[Convert]::ToBase64String((1..48|%%{Get-Random -Max 256})-as[byte[]]) -replace '[^A-Za-z0-9]','' | Select-Object -First 1"') do set NEW_SECRET=%%i
    
    :: 替换 JWT_SECRET（使用 PowerShell）
    powershell -Command "(Get-Content env.local) -replace 'JWT_SECRET=\"[^\"]*\"', 'JWT_SECRET=\"%NEW_SECRET%\"' | Set-Content env.local"
    
    echo [√] 已自动生成安全的 JWT_SECRET
)
call npm install

echo.
echo [4/5] 配置前端...
cd ..\frontend
call npm install

echo.
echo [5/5] 启动服务...
cd ..
start "后端服务" cmd /k "cd backend && npm run dev"
timeout /t 5 >nul
start "前端服务" cmd /k "cd frontend && npm run dev"

echo.
echo ════════════════════════════════════════════════════
echo 🎉 安装完成！
echo.
echo   前端地址: http://localhost:5173
echo   后端地址: http://localhost:3100
echo   管理后台: http://localhost:5173/admin
echo.
echo   默认账号: admin / admin123456
echo.
echo   项目目录: %USERPROFILE%\start
echo ════════════════════════════════════════════════════
echo.

:: 等待后端启动后打开浏览器
echo 等待服务启动...
timeout /t 30 >nul
start http://localhost:5173

pause
