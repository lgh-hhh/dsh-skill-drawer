@echo off
chcp 65001 >nul
echo Restoring the newest DSH desktop profile backup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback-desktop-profile.ps1"
echo.
pause
