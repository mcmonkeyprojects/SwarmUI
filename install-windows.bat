@echo off

cd /d "%~dp0"

if exist SwarmUI (
    echo SwarmUI is already installed in this folder. If this is incorrect, delete the 'SwarmUI' folder and try again.
    pause
    exit /b
)

if exist SwarmUI.sln (
    echo SwarmUI is already installed in this folder. If this is incorrect, delete 'SwarmUI.sln' and try again.
    pause
    exit /b
)

set "tempfile=%TEMP%\swarm_dotnet_sdklist.tmp"
dotnet --list-sdks > "%tempfile%"
findstr "8.0." "%tempfile%" > nul
if %ERRORLEVEL% neq 0 (
    echo DotNet SDK 8 is not installed, will install from WinGet...
    winget install Microsoft.DotNet.SDK.8 --accept-source-agreements --accept-package-agreements
)
del "%tempfile%"

WHERE git
IF %ERRORLEVEL% NEQ 0 (
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
)

git clone https://github.com/mcmonkeyprojects/SwarmUI
cd SwarmUI

cmd /c .\launch-windows.bat --launch_mode webinstall

IF %ERRORLEVEL% NEQ 0 ( pause )
