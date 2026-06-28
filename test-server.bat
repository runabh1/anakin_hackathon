@echo off
cd /d "%~dp0"
echo Testing First Gen Navigator server...
echo.
node server.js
echo.
echo If this window closes or shows an error, send that error to Codex.
pause
