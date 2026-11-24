@echo off
setlocal EnableDelayedExpansion

set "PORT=6007"
set /a "HTTPS_PORT=%PORT%+1"
set "APP_DIR=%~dp0"
set "SERVER_JS=%APP_DIR%server.js"
set "VBS_SCRIPT=%APP_DIR%start_hidden.vbs"

REM ===== Node.js 目标版本 =====
set "NODE_TARGET_MM=24.20"
set "NODE_DEFAULT_VER=24.20.0"
set "SET_NPM_MIRROR=1"
set "NPM_MIRROR_URL=https://registry.npmmirror.com"

cls
echo ========================================
echo   RCS Tool Platform - Start
echo ========================================
echo.

REM === 1. Check Node.js 24.20 (auto-install if missing/old) ===
echo [1/6] Checking Node.js %NODE_TARGET_MM%.x...
set "NEED_NODE=0"
where node >nul 2>&1
if errorlevel 1 (
    set "NEED_NODE=1"
    echo       Node.js not found.
) else (
    for /f "tokens=*" %%i in ('node -v 2^>^&1') do set "NV=%%i"
    echo       Found Node.js !NV!
    set "MM=!NV:~1,5!"
    if not "!MM!"=="%NODE_TARGET_MM%" (
        set "NEED_NODE=1"
        echo       Version does not match %NODE_TARGET_MM%.x, will reinstall.
    )
)

if "!NEED_NODE!"=="1" (
    REM Install needs Administrator; re-launch elevated if necessary
    net session >nul 2>&1
    if errorlevel 1 (
        echo       Node.js %NODE_TARGET_MM%.x is required. Requesting Administrator to install...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
        echo       A UAC window should appear - click Yes.
        pause
        goto :EOF
    )
    echo       Auto-installing Node.js %NODE_DEFAULT_VER%...
    goto :INSTALL_NODE
)
echo [OK] Node.js %NV% (matches %NODE_TARGET_MM%.x)

:CONTINUE_START
REM === 2. Check server.js ===
echo.
echo [2/6] Checking server.js...
if not exist "%SERVER_JS%" (
    echo [ERROR] server.js not found in:
    echo %APP_DIR%
    pause
    exit /b 1
)
echo [OK] Found

REM === 3. Check dependencies ===
echo.
echo [3/6] Checking dependencies...
cd /d "%APP_DIR%"
call npm install --production
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)
echo [OK] Dependencies ready

REM === 4. Check port ===
echo.
echo [4/6] Checking port %PORT%/%HTTPS_PORT%...
set "PID="
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /i ":%PORT%.*LISTENING"') do set "PID=%%a"
if defined PID (
    echo [WARN] Port %PORT% occupied by PID=%PID%
    set /p "K=Kill it and continue? (y/n): "
    if /i "!K!"=="y" (
        taskkill /F /PID !PID! >nul 2>&1
        timeout /t 2 >nul
        echo [OK] Port released
    ) else (
        echo [CANCEL]
        pause
        exit /b 1
    )
) else (
    echo [OK] Port %PORT% available
)
set "PID2="
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /i ":%HTTPS_PORT%.*LISTENING"') do set "PID2=%%a"
if defined PID2 (
    echo [WARN] Port %HTTPS_PORT% occupied by PID=%PID2%
    set /p "K=Kill it and continue? (y/n): "
    if /i "!K!"=="y" (
        taskkill /F /PID !PID2! >nul 2>&1
        timeout /t 2 >nul
        echo [OK] Port released
    ) else (
        echo [CANCEL]
        pause
        exit /b 1
    )
) else (
    echo [OK] Port %HTTPS_PORT% available
)

REM === 5. Generate SSL certificates ===
echo.
echo [5/6] Generating SSL certificates...
if not exist "%APP_DIR%ssl" mkdir "%APP_DIR%ssl"
cd /d "%APP_DIR%"
node -e "const forge=require('node-forge');const fs=require('fs');const path=require('path');const keys=forge.pki.rsa.generateKeyPair(2048);const cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='01';cert.validity.notBefore=new Date();cert.validity.notAfter=new Date();cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear()+1);const attrs=[{name:'commonName',value:'localhost'}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.setExtensions([{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:7,ip:'127.0.0.1'}]}]);cert.sign(keys.privateKey,forge.md.sha256.create());fs.writeFileSync(path.join('ssl','cert.pem'),forge.pki.certificateToPem(cert));fs.writeFileSync(path.join('ssl','key.pem'),forge.pki.privateKeyToPem(keys.privateKey));console.log('OK');"
if %errorlevel% equ 0 (
    echo [OK] SSL certificate generated (valid 365 days)
) else (
    echo [ERROR] SSL certificate generation failed
)

REM === 6. Start service via VBS (hidden, no popup) ===
echo.
echo [6/6] Starting service (background mode)...

cd /d "%APP_DIR%"
cscript //nologo "%VBS_SCRIPT%" >nul 2>&1

REM Wait and verify
timeout /t 3 >nul

set "RUNNING="
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /i ":%PORT%.*LISTENING"') do set "RUNNING=1"

cls
if defined RUNNING (
    echo ========================================
    echo   [SUCCESS] Service started!
    echo ========================================
    echo.
    echo   HTTP  : http://localhost:%PORT%
    echo   HTTPS : https://localhost:%HTTPS_PORT%
    echo   Mode  : Background (no window)
    echo   Stop  : run stop.bat
    echo ========================================
    echo.
    set /p "O=Open browser? (y/n): "
    if /i "!O!"=="y" start http://localhost:%PORT%
) else (
    echo [FAILED] Service did not start
    echo Check server.log for errors
    echo.
)

pause
endlocal
goto :EOF

REM ============================================================
REM  INSTALL_NODE  -  Silent auto-install of Node.js 24.20.x
REM  (merged from install-node.bat)
REM ============================================================
:INSTALL_NODE
echo.
echo ===== Installing Node.js %NODE_DEFAULT_VER% =====
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITECTURE%"=="x86"   set "ARCH=x86"

REM resolve latest 24.20.x (fallback to pinned)
set "VER_FILE=%TEMP%\node_mm_ver.txt"
if exist "%VER_FILE%" del /f /q "%VER_FILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $j=Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30; $v=($j | Where-Object { $_.version -like 'v%NODE_TARGET_MM%.*' -and ($_.files -contains 'win-%ARCH%-msi') } | Select-Object -First 1).version; if($v){Set-Content -LiteralPath (Join-Path $env:TEMP 'node_mm_ver.txt') -Value $v -Encoding Ascii} } catch {}"
set "NODE_VER=%NODE_DEFAULT_VER%"
if exist "%VER_FILE%" set /p "NODE_VER=" < "%VER_FILE%"
if /i "%NODE_VER:~0,1%"=="v" set "NODE_VER=%NODE_VER:~1%"

set "NODE_MSI=node-v%NODE_VER%-%ARCH%.msi"
set "TMP_MSI=%TEMP%\%NODE_MSI%"
set "MSI_LOG=%TEMP%\node_install.log"
set "URL_OFFICIAL=https://nodejs.org/dist/v%NODE_VER%/%NODE_MSI%"
set "URL_MIRROR=https://npmmirror.com/mirrors/node/v%NODE_VER%/%NODE_MSI%"

echo       Target package : %NODE_MSI%
echo       Downloading installer...
if exist "%TMP_MSI%" del /f /q "%TMP_MSI%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $ok=$false; foreach($u in @('%URL_OFFICIAL%','%URL_MIRROR%')){ try{ Write-Host ('      Trying '+$u); Invoke-WebRequest -Uri $u -OutFile (Join-Path $env:TEMP '%NODE_MSI%') -TimeoutSec 900 -UseBasicParsing; if((Get-Item (Join-Path $env:TEMP '%NODE_MSI%')).Length -gt 5MB){$ok=$true; Write-Host '      Download OK.'; break} else {Write-Host '      File too small, retry.'} }catch{Write-Host ('      Failed: '+$_.Exception.Message)} }; if(-not $ok){exit 1}"
if errorlevel 1 (
    echo [ERROR] Download failed from both sources.
    pause
    exit /b 1
)

echo       Installing (silent)...
msiexec /i "%TMP_MSI%" /qn /norestart ADDLOCAL=ALL /L*V "%MSI_LOG%"
set "MSI_RC=%errorlevel%"
if "%MSI_RC%"=="3010" (
    echo       Installer finished and requests a reboot to complete.
) else if not "%MSI_RC%"=="0" (
    echo [ERROR] msiexec exited with code %MSI_RC%. Log: %MSI_LOG%
    pause
    exit /b 1
)
echo [OK] Node.js installed.

REM Refresh PATH for this window
set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
if exist "%ProgramFiles(x86)%\nodejs" set "PATH=%PATH%;%ProgramFiles(x86)%\nodejs"

REM Fix bundled npm: Node 24 ships npm 11.19 with a minipass bug that
REM breaks `npm install` (Class extends value undefined). Upgrade to 12.0.2.
echo       Upgrading bundled npm to 12.0.2 (fixes Node 24 + npm 11.19 bug)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $npmDir=Join-Path $env:ProgramFiles 'nodejs\node_modules\npm'; $bak=$npmDir+'.bak'; if(Test-Path $bak){Remove-Item $bak -Recurse -Force}; try{Rename-Item $npmDir $bak -ErrorAction Stop}catch{}; $tgz=Join-Path $env:TEMP 'npm1202.tgz'; try{Invoke-WebRequest -Uri 'https://registry.npmmirror.com/npm/-/npm-12.0.2.tgz' -OutFile $tgz -UseBasicParsing; New-Item -ItemType Directory -Force -Path $npmDir|Out-Null; tar -xzf $tgz -C $env:TEMP; Copy-Item -Recurse -Force (Join-Path $env:TEMP 'package\*') $npmDir; Remove-Item $tgz,$env:TEMP\package -Recurse -Force; $v=(Get-Content (Join-Path $npmDir 'package.json')|ConvertFrom-Json).version; Write-Host ('[OK] npm -> '+$v)}catch{Write-Host '[WARN] npm auto-upgrade failed; run install-node.bat manually'}"

if "%SET_NPM_MIRROR%"=="1" (
    call npm config set registry %NPM_MIRROR_URL% >nul 2>&1
)

if exist "%TMP_MSI%" del /f /q "%TMP_MSI%"
if exist "%VER_FILE%" del /f /q "%VER_FILE%"

echo       Node.js %NODE_VER% ready.
echo.
goto :CONTINUE_START
