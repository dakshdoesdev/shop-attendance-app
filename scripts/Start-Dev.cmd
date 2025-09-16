@echo off
setlocal
title Shop Attendance — Start Dev (ngrok)
cd /d "%~dp0.."

echo ============================================
echo   Shop Attendance — Start Dev (ngrok)
echo ============================================
echo.

REM Ensure ngrok authtoken exists (one-time)
set "NGROK_CFG=%USERPROFILE%\.config\ngrok\ngrok.yml"
set "NEED_AUTH=1"
if exist "%NGROK_CFG%" (
  findstr /R /C:"^[ ]*authtoken:" "%NGROK_CFG%" >nul 2>&1 && set "NEED_AUTH="
)
if defined NEED_AUTH (
  echo ngrok authentication is required once.
  echo   Get token: https://dashboard.ngrok.com/get-started/your-authtoken
  set /p NGROK_TOKEN=Paste ngrok authtoken and press Enter: 
  if not "%NGROK_TOKEN%"=="" ngrok config add-authtoken %NGROK_TOKEN%
)

echo Starting dev on https://nonstriped-jocelyn-nonnormal.ngrok-free.app ...
npm run dev:ngrok
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo Dev failed or exited with error. Press any key to exit.
pause >nul
exit /b 1

