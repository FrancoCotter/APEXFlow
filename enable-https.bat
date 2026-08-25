@echo off
REM Enable trusted HTTPS for an existing APEXFlow installation on Windows.
setlocal

cd /d "%~dp0"

echo ==================================
echo   Enable APEXFlow HTTPS (Windows)
echo ==================================
echo.

where node >nul 2>&1
if errorlevel 1 goto missing_setup
if not exist "node_modules" goto missing_setup
if not exist "server\node_modules" goto missing_setup

set "MKCERT_EXE="
if exist ".tools\mkcert\mkcert.exe" set "MKCERT_EXE=%CD%\.tools\mkcert\mkcert.exe"
if defined MKCERT_EXE goto mkcert_ready

for /f "delims=" %%i in ('where mkcert 2^>nul') do if not defined MKCERT_EXE set "MKCERT_EXE=%%i"
if defined MKCERT_EXE goto mkcert_ready

echo Downloading the official mkcert v1.4.4 portable binary...
if not exist ".tools\mkcert" mkdir ".tools\mkcert"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe' -OutFile '.tools\mkcert\mkcert.exe'"
if errorlevel 1 goto mkcert_download_failed

for /f "delims=" %%h in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath '.tools\mkcert\mkcert.exe').Hash"') do set "MKCERT_HASH=%%h"
if /I not "%MKCERT_HASH%"=="D2660B50A9ED59EADA480750561C96ABC2ED4C9A38C6A24D93E30E0977631398" goto mkcert_hash_failed
set "MKCERT_EXE=%CD%\.tools\mkcert\mkcert.exe"

:mkcert_ready
echo Installing the APEXFlow local CA into the Windows trust store...
"%MKCERT_EXE%" -install
if errorlevel 1 goto trust_failed

for /f "delims=" %%i in ('powershell -NoProfile -Command "$config = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.IPv4Address -ne $null } | Select-Object -First 1; if ($config) { $config.IPv4Address.IPAddress }"') do set "LOCAL_IP=%%i"

if not exist "certs\local" mkdir "certs\local"
echo Generating the APEXFlow server certificate...
if defined LOCAL_IP goto generate_with_lan

"%MKCERT_EXE%" -cert-file "certs\local\apexflow-cert.pem" -key-file "certs\local\apexflow-key.pem" localhost 127.0.0.1 ::1 "%COMPUTERNAME%" "%COMPUTERNAME%.local"
goto certificate_generated

:generate_with_lan
"%MKCERT_EXE%" -cert-file "certs\local\apexflow-cert.pem" -key-file "certs\local\apexflow-key.pem" localhost 127.0.0.1 ::1 "%LOCAL_IP%" "%COMPUTERNAME%" "%COMPUTERNAME%.local"

:certificate_generated
if errorlevel 1 goto certificate_failed

for /f "usebackq delims=" %%i in (`"%MKCERT_EXE%" -CAROOT`) do set "MKCERT_CAROOT=%%i"
if not defined MKCERT_CAROOT goto caroot_failed
copy /y "%MKCERT_CAROOT%\rootCA.pem" "certs\local\apexflow-rootCA.pem" >nul
if errorlevel 1 goto caroot_failed

REM Ensure browsers launched by this Windows user can trust the local CA.
certutil -user -addstore -f Root "certs\local\apexflow-rootCA.pem" >nul
if errorlevel 1 goto trust_failed

echo.
echo ==================================
echo   HTTPS Certificate Ready!
echo ==================================
echo.
echo   Local: https://localhost:3000
if defined LOCAL_IP echo   LAN:   https://%LOCAL_IP%:3000
echo.
echo Run start.bat and choose HTTPS when prompted.
echo If a Mac will access this Windows PC over LAN, copy only:
echo   certs\local\apexflow-rootCA.pem
echo Then follow:
echo   docs\HTTPS_SETUP.md
echo.
echo Never share apexflow-key.pem or rootCA-key.pem.
echo.
pause
exit /b 0

:missing_setup
echo APEXFlow dependencies were not found.
echo Please run setup.bat first, then run enable-https.bat again.
goto failed

:mkcert_download_failed
echo Failed to download mkcert. Check the internet connection and try again.
goto failed

:mkcert_hash_failed
echo The downloaded mkcert file did not match the expected SHA-256 hash.
del /q ".tools\mkcert\mkcert.exe" >nul 2>&1
goto failed

:trust_failed
echo Failed to install the local CA. Accept the Windows certificate prompt and try again.
goto failed

:certificate_failed
echo Failed to generate the HTTPS server certificate.
goto failed

:caroot_failed
echo The server certificate was generated, but the public root CA could not be copied.

:failed
echo.
pause
exit /b 1
