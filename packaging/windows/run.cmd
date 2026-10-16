@echo off
setlocal
chcp 65001 >nul
"%~dp0runtime\node.exe" "%~dp0payload\scripts\desktop-launcher.mjs" %*
set "bridgeExit=%errorlevel%"
echo.
pause
exit /b %bridgeExit%
