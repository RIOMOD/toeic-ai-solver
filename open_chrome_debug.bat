@echo off
chcp 65001 >nul
echo ========================================================
echo   Đang khởi động Google Chrome ở chế độ Debug Port 9222
echo ========================================================

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_PATH%" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if not exist "%CHROME_PATH%" (
    echo [LỖI] Không tìm thấy file chrome.exe tại thư mục cài đặt mặc định!
    pause
    exit /b
)

set "USER_DATA=%~dp0chrome_debug_profile"

start "" "%CHROME_PATH%" --remote-debugging-port=9222 --user-data-dir="%USER_DATA%" --no-first-run --no-default-browser-check --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,AutomaticTabDiscarding
echo [THÀNH CÔNG] Chrome đã được mở với cờ chống ngủ (Anti-Sleep/Anti-Throttle 24/24)!
echo Bây giờ bạn có thể đăng nhập vào web bài tập và kích hoạt Extension/Bot để chạy liên tục.
timeout /t 3 >nul
