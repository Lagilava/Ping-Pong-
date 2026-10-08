@echo off
rem Puts the game online so testers anywhere (PC or phone) can play it.
rem Shows a public link + QR code. Close this window to stop sharing.
title Ping Pong Neon - Share Online
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\share.ps1" %*
if errorlevel 1 pause
