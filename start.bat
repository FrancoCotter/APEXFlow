@echo off
REM APEXFlow Startup Script for Windows
setlocal
cd /d "%~dp0"

echo ==================================
echo   APEXFlow (Windows)
echo ==================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: Dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "server\node_modules" (
    echo Error: Server dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

set "APP_SCHEME=http"
set "USE_HTTPS=0"
choice /C YN /N /M "Start APEXFlow with HTTPS? [Y/N]: "
if errorlevel 2 goto protocol_ready

if not exist "%~dp0certs\local\apexflow-cert.pem" goto missing_https
if not exist "%~dp0certs\local\apexflow-key.pem" goto missing_https
set "APP_SCHEME=https"
set "USE_HTTPS=1"
goto protocol_ready

:missing_https
echo.
echo HTTPS certificate was not found.
echo Run enable-https.bat first. APEXFlow will continue with HTTP this time.
echo.

:protocol_ready

REM Get local IP for LAN access
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set LOCAL_IP=%%b
    )
)

echo Starting APEXFlow...
echo.
echo Make sure ACE-Step API is running:
echo   cd path\to\ACE-Step
echo   uv run acestep-api --port 8001
echo.
echo ==================================
echo.

REM Start backend in new window
echo Starting backend server...
start "APEXFlow Backend" cmd /k "cd server && npm run dev"

REM Wait for backend to start
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo Starting frontend...
if "%USE_HTTPS%"=="1" (
    start "APEXFlow Frontend" cmd /k "set APEXFLOW_HTTPS=true&&npm run dev"
) else (
    start "APEXFlow Frontend" cmd /k "set APEXFLOW_HTTPS=false&&npm run dev"
)

REM Wait a moment
timeout /t 2 /nobreak >nul

echo.
echo ==================================
echo   APEXFlow Running!
echo ==================================
echo.
echo   Frontend: %APP_SCHEME%://localhost:3000
echo   Backend:  http://localhost:3001
echo.
if defined LOCAL_IP (
    echo   LAN Access: %APP_SCHEME%://%LOCAL_IP%:3000
    echo.
)
echo   Close the terminal windows to stop.
echo.
echo ==================================
echo.
echo Opening browser...
timeout /t 2 /nobreak >nul
start %APP_SCHEME%://localhost:3000

pause
