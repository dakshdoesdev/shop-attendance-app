@echo off
setlocal
title Shop Attendance — Install Everything
cd /d "%~dp0.."

echo ===============================================
echo   Shop Attendance — Install Everything (Windows)
echo ===============================================
echo.
echo This will:
echo   - Install Node LTS (winget) if missing
echo   - Install ngrok agent if missing
echo   - Install npm packages
echo   - Write env files for your reserved domain
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup.ps1" -Domain nonstriped-jocelyn-nonnormal.ngrok-free.app
if errorlevel 1 goto error

echo.
echo Install completed successfully.
echo Next: double-click scripts\Start-Dev.cmd to run the app.
pause
exit /b 0

:error
echo.
echo Install failed. See messages above. Press any key to exit.
pause >nul
exit /b 1

