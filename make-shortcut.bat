@echo off

set SHORTCUTPATH="%userprofile%\Desktop\SwarmUI.url"
echo [InternetShortcut] >> "%SHORTCUTPATH%"
echo URL="%CD%\launch-windows.bat" >> "%SHORTCUTPATH%"
echo IconFile="%CD%\src\wwwroot\favicon.ico" >> "%SHORTCUTPATH%"
echo IconIndex=0 >> "%SHORTCUTPATH%"
