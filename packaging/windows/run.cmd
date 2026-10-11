@echo off
chcp 65001 >nul
where node >nul 2>&1
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 24 或更新版本，再重新打开本窗口。
  pause
  exit /b 1
)
node "%~dp0payload\scripts\launcher.mjs" %1
echo.
pause
