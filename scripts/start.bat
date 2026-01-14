@echo off
chcp 65001 >nul 2>&1
title Start 启动页 - 控制面板

:: ============================================
:: 检查并请求管理员权限
:: 这是为了解决 Windows Hyper-V 端口保留问题
:: ============================================
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"

if '%errorlevel%' NEQ '0' (
    echo.
    echo   需要管理员权限来解决端口保留问题...
    echo   正在请求管理员权限...
    echo.
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

:: ============================================
:: 检查 Node.js
:: ============================================
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   错误：未找到 Node.js
    echo   请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: ============================================
:: 运行启动脚本
:: ============================================
node "%~dp0start.js"

:: 如果脚本异常退出
if %errorlevel% neq 0 (
    echo.
    echo   启动脚本异常退出
    pause
)
