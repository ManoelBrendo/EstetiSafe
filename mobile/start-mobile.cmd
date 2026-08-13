@echo off
setlocal

cd /d "%~dp0"
set "EXPO_NO_TELEMETRY=1"

if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" node_modules\expo\bin\cli start --localhost --clear
) else (
  npm run start:local
)
