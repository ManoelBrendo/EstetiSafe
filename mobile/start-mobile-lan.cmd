@echo off
setlocal

cd /d "%~dp0"
set "EXPO_NO_TELEMETRY=1"

if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" node_modules\expo\bin\cli start --lan --clear
) else (
  npm run start:lan
)
