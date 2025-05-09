@echo off
setlocal ENABLEDELAYEDEXPANSION

rem Ensure correct local path.
cd /D "%~dp0"

rem Microsoft borked the dotnet installer/path handler, so force x64 to be read first
set PATH=C:\Program Files\dotnet;%PATH%

set DOTNET_CLI_TELEMETRY_OPTOUT=1

rem Server settings option
if exist .\src\bin\always_pull (
    echo Pulling latest changes...
    git pull
)

if not exist .git (
    echo.
    echo.
    echo WARNING: YOU DID NOT CLONE FROM GIT. THIS WILL BREAK SOME SYSTEMS. PLEASE INSTALL PER THE README.
    echo.
    echo.
    timeout 5
) else (
    for /f "delims=" %%i in ('git rev-parse HEAD') do set CUR_HEAD=%%i
    set /p BUILT_HEAD=<src/bin/last_build
    if not "!CUR_HEAD!"=="!BUILT_HEAD!" (
        echo.
        echo.
        echo WARNING: You did a git pull without building. Will now build for you...
        echo.
        echo.
        echo. 2>.\src\bin\must_rebuild
    )
)

if exist .\src\bin\must_rebuild (
    echo Rebuilding...
    if exist .\src\bin\live_release (
        rmdir /s /q .\src\bin\live_release_backup
        move .\src\bin\live_release .\src\bin\live_release_backup
    )
    del .\src\bin\must_rebuild
)

rem Build the program if it isn't already built
if not exist src\bin\live_release\SwarmUI.exe (
    rem For some reason Microsoft's nonsense is missing the official nuget source? So forcibly add that to be safe.
    dotnet nuget add source https://api.nuget.org/v3/index.json --name "NuGet official package source"

    dotnet build src/SwarmUI.csproj --configuration Release -o src/bin/live_release
    for /f "delims=" %%i in ('git rev-parse HEAD') do set CUR_HEAD2=%%i
    echo !CUR_HEAD2!> src/bin/last_build
)

if not exist src\bin\live_release\SwarmUI.exe if exist src\bin\live_release_backup\SwarmUI.exe (
    echo.
    echo.
    echo WARNING: BUILD FAILED? Restoring backup...
    echo.
    echo.
    timeout 5
    rmdir /s /q src\bin\live_release
    move src\bin\live_release_backup src\bin\live_release
)

rem Default env configuration, gets overwritten by the C# code's settings handler
set ASPNETCORE_ENVIRONMENT="Production"
set ASPNETCORE_URLS="http://*:7801"

.\src\bin\live_release\SwarmUI.exe %*

rem Exit code 42 means restart, anything else = don't.
if %ERRORLEVEL% EQU 42 (
    echo Restarting...
    call launch-windows.bat %*
)

IF %ERRORLEVEL% NEQ 0 ( pause )
