@echo off
setlocal

cd /d "%~dp0"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
set "REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2"
set "EXPO_NO_TELEMETRY=1"
set "PATH=C:\Program Files\nodejs;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"

if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" node_modules\expo\bin\cli start --android --lan --clear
) else (
  npm run start:android-emulator
)
