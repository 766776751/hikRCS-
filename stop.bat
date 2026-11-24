@echo off
setlocal

set "PORT=6007"
set /a "HTTPS_PORT=%PORT%+1"

cls
echo ==========
echo   Stop RCS Service
echo ==========
echo.

set "PID="
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /i ":%PORT%.*LISTENING"') do set "PID=%%a"

if not defined PID (
    echo [INFO] No service running on port %PORT%
    echo.
    pause
    exit /b 0
)

echo [INFO] Service running on ports %PORT%/%HTTPS_PORT%, PID=%PID%
echo.
set /p "C=Stop it? (y/n): "
if /i not "%C%"=="y" (
    echo [CANCEL]
    pause
    exit /b 0
)

taskkill /F /PID %PID% >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Service stopped
) else (
    echo.
    echo [ERROR] Failed, try: taskkill /F /PID %PID%
)
echo.
pause
endlocal
