@echo off

rem Ensure correct local path (repo root).
cd /D "%~dp0.."

rem Microsoft borked the dotnet installer/path handler, so force x64 to be read first
set PATH=C:\Program Files\dotnet;%PATH%

set DOTNET_CLI_TELEMETRY_OPTOUT=1
set DOTNET_CLI_UI_LANGUAGE=en

dotnet test SwarmUITests/SwarmUITests.csproj --configuration Release

IF %ERRORLEVEL% NEQ 0 ( pause )
