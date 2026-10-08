@echo off
rem ==========================================================================
rem  Ping Pong - Neon Edition : double-click to play.
rem
rem  Starts a small local web server (built into Windows, nothing to install)
rem  and opens the game in Chrome or Edge. Keep the window that opens running
rem  while you play; close it to stop the game.
rem
rem  Optional: run  "Play Ping Pong.bat" uncapped  to unlock frame rates above
rem  your screen's refresh rate (may cause tearing).
rem ==========================================================================
title Ping Pong - Neon Edition
cd /d "%~dp0"

if not exist "game\index.html" (
    echo [!] The "game" folder is missing next to this file.
    echo     Keep "Play Ping Pong.bat" in the same folder as "game" and "tools".
    pause
    exit /b 1
)

set "EXTRA="
if /i "%~1"=="uncapped" set "EXTRA=-Uncapped"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" %EXTRA%
if errorlevel 1 (
    echo.
    echo [!] The game server stopped with an error. See the message above.
    pause
)
