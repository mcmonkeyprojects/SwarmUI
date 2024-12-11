@echo off
setlocal ENABLEDELAYEDEXPANSION

set SHORTCUTPATH="%userprofile%\Desktop\SwarmUI.url"
if exist "%userprofile%\Desktop" (
    del "%SHORTCUTPATH%"
    echo [InternetShortcut] >> "%SHORTCUTPATH%"
    echo URL="%CD%\launch-windows.bat" >> "%SHORTCUTPATH%"
    echo IconFile="%CD%\src\wwwroot\favicon.ico" >> "%SHORTCUTPATH%"
    echo IconIndex=0 >> "%SHORTCUTPATH%"
)

set SHORTCUTPATH="%userprofile%\Onedrive\Desktop\SwarmUI.url"
if exist "%userprofile%\Onedrive\Desktop" (
    del "%SHORTCUTPATH%"
    echo [InternetShortcut] >> "%SHORTCUTPATH%"
    echo URL="%CD%\launch-windows.bat" >> "%SHORTCUTPATH%"
    echo IconFile="%CD%\src\wwwroot\favicon.ico" >> "%SHORTCUTPATH%"
    echo IconIndex=0 >> "%SHORTCUTPATH%"
)
