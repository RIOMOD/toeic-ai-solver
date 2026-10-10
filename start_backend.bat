@echo off
chcp 65001 >nul
echo ========================================================
echo   AI English Auto Solver Backend (Duy trì 24/24)
echo ========================================================
cd /d "%~dp0backend"

:loop
echo [%date% %time%] 🚀 Khởi chạy Backend Server...
node server.js
echo.
echo [CẢNH BÁO] Backend Server vừa dừng lại!
echo [24/7 Watchdog] Tự động khởi động lại sau 3 giây...
timeout /t 3 >nul
goto loop

