@echo off

cd /d "%~dp0"

if exist SwarmUI (
    echo SwarmUI is already installed in this folder. If this is incorrect, delete the 'SwarmUI' folder and try again.
    pause
    exit
)

if exist SwarmUI.sln (
    echo SwarmUI is already installed in this folder. If this is incorrect, delete 'SwarmUI.sln' and try again.
    pause
    exit
)

winget install Microsoft.DotNet.SDK.8 --accept-source-agreements --accept-package-agreements
winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements

git clone https://github.com/mcmonkeyprojects/SwarmUI
cd SwarmUI

call .\make-shortcut.bat

call .\launch-windows.bat --launch_mode webinstall

IF %ERRORLEVEL% NEQ 0 ( pause )
