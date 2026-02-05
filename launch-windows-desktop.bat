@echo off
setlocal ENABLEDELAYEDEXPANSION

rem ============================================================
rem  SwarmUI Desktop Launcher
rem  A native Windows desktop application for SwarmUI
rem ============================================================

title SwarmUI Desktop Launcher

rem Ensure correct local path
cd /D "%~dp0"

rem Microsoft borked the dotnet installer/path handler, so force x64 to be read first
set PATH=C:\Program Files\dotnet;%PATH%

rem Disable .NET telemetry
set DOTNET_CLI_TELEMETRY_OPTOUT=1

echo.
echo  ========================================
echo   SwarmUI Desktop Application Launcher
echo  ========================================
echo.

rem Check if .NET 8 SDK is installed (needed for building)
set "tempfile=%TEMP%\swarm_dotnet_check.tmp"
dotnet --list-sdks 2>nul > "%tempfile%"
findstr "8.0." "%tempfile%" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [!] .NET 8 SDK not found. Attempting to install via WinGet...
    echo.
    
    rem Try WinGet first (Windows 11 / Windows 10 with App Installer)
    where winget >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo     Installing .NET 8 SDK via WinGet...
        winget install Microsoft.DotNet.SDK.8 --accept-source-agreements --accept-package-agreements
        if %ERRORLEVEL% NEQ 0 (
            echo.
            echo [ERROR] WinGet installation failed!
            goto :dotnet_manual_install
        )
        echo [OK] .NET 8 SDK installed successfully!
        echo     Please restart this script to continue.
        pause
        exit /b 0
    ) else (
        goto :dotnet_manual_install
    )
)
del "%tempfile%" 2>nul
goto :dotnet_ok

:dotnet_manual_install
del "%tempfile%" 2>nul
echo.
echo [ERROR] .NET 8 SDK is not installed and could not be auto-installed.
echo.
echo Please download and install manually from:
echo   https://dotnet.microsoft.com/download/dotnet/8.0
echo.
echo After installation, run this script again.
echo.
pause
exit /b 1

:dotnet_ok
del "%tempfile%" 2>nul

rem Auto-pull if enabled in server settings
if exist .\src\bin\always_pull (
    echo [*] Pulling latest changes from git...
    git pull
    echo.
)

rem Check for git installation issues
if not exist .git (
    echo.
    echo [WARNING] This folder was not cloned from Git.
    echo           Some features may not work correctly.
    echo           Please install per the README instructions.
    echo.
    timeout /t 3 >nul
) else (
    rem Check if rebuild is needed
    for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set CUR_HEAD=%%i
    if exist src\bin\last_build (
        set /p BUILT_HEAD=<src\bin\last_build
    ) else (
        set BUILT_HEAD=none
    )
    if not "!CUR_HEAD!"=="!BUILT_HEAD!" (
        echo [*] Changes detected, marking for rebuild...
        echo. 2>.\src\bin\must_rebuild
    )
)

rem Handle rebuild if needed
if exist .\src\bin\must_rebuild (
    echo [*] Rebuilding SwarmUI...
    if exist .\src\bin\live_release_desktop (
        rmdir /s /q .\src\bin\live_release_desktop_backup 2>nul
        move .\src\bin\live_release_desktop .\src\bin\live_release_desktop_backup >nul 2>&1
    )
    del .\src\bin\must_rebuild 2>nul
)

rem Check if main server is built (required for desktop app)
if not exist src\bin\live_release\SwarmUI.exe (
    echo [!] SwarmUI server not found.
    echo     Building main server first...
    echo.
    
    rem Add nuget source if missing
    dotnet nuget add source https://api.nuget.org/v3/index.json --name "NuGet official package source" 2>nul
    
    echo     This may take a few minutes on first run...
    echo.
    dotnet build src/SwarmUI.csproj --configuration Release -o src/bin/live_release
    
    if not exist src\bin\live_release\SwarmUI.exe (
        echo.
        echo [ERROR] Failed to build SwarmUI server!
        echo         Please check for errors above and try again.
        echo.
        pause
        exit /b 1
    )
    
    for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do echo %%i> src\bin\last_build
    echo.
    echo [OK] SwarmUI server built successfully!
    echo.
)

rem Build the desktop application if needed
if not exist src\bin\live_release_desktop\SwarmUI.Desktop.exe (
    echo [*] Building SwarmUI Desktop application...
    echo.
    
    rem Add nuget source if missing
    dotnet nuget add source https://api.nuget.org/v3/index.json --name "NuGet official package source" 2>nul
    
    dotnet build src/Desktop/SwarmUI.Desktop.csproj --configuration Release -o src/bin/live_release_desktop
    
    if not exist src\bin\live_release_desktop\SwarmUI.Desktop.exe (
        echo.
        echo [ERROR] Failed to build SwarmUI Desktop!
        
        rem Try to restore backup if available
        if exist src\bin\live_release_desktop_backup\SwarmUI.Desktop.exe (
            echo         Restoring previous version...
            rmdir /s /q src\bin\live_release_desktop 2>nul
            move src\bin\live_release_desktop_backup src\bin\live_release_desktop >nul 2>&1
        ) else (
            echo         Please check for errors above and try again.
            pause
            exit /b 1
        )
    ) else (
        for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do echo %%i> src\bin\last_build_desktop
        echo [OK] SwarmUI Desktop built successfully!
    )
    echo.
)

rem Clean up backup if build succeeded
if exist src\bin\live_release_desktop_backup (
    if exist src\bin\live_release_desktop\SwarmUI.Desktop.exe (
        rmdir /s /q src\bin\live_release_desktop_backup 2>nul
    )
)

rem Set environment variables
set ASPNETCORE_ENVIRONMENT=Production
set ASPNETCORE_URLS=http://*:7801

echo [*] Starting SwarmUI Desktop...
echo.
echo     - The app will open in a native Windows window
echo     - You can minimize to the system tray
echo     - Close the window or use tray menu to exit
echo.

rem Launch the desktop application
start "" ".\src\bin\live_release_desktop\SwarmUI.Desktop.exe" %*

rem Check if restart was requested (exit code 42)
if %ERRORLEVEL% EQU 42 (
    echo [*] Restart requested, relaunching...
    timeout /t 2 >nul
    call "%~f0" %*
)

rem Only pause on error
if %ERRORLEVEL% NEQ 0 if %ERRORLEVEL% NEQ 42 (
    echo.
    echo [ERROR] SwarmUI Desktop exited with code %ERRORLEVEL%
    pause
)
