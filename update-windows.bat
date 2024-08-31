@echo off

rem Ensure correct local path.
cd /D "%~dp0"

rem Microsoft borked the dotnet installer/path handler, so force x64 to be read first
set PATH=C:\Program Files\dotnet;%PATH%

set DOTNET_CLI_TELEMETRY_OPTOUT=1

rem For some reason Microsoft's nonsense is missing the official nuget source? So forcibly add that to be safe.
dotnet nuget add source https://api.nuget.org/v3/index.json --name "NuGet official package source"

rem The actual update
git pull

rem Make a backup of the current live_release to be safe
if exist src\bin\live_release\ (
    rmdir /s /q src\bin\live_release_backup
    move src\bin\live_release src\bin\live_release_backup
)

rem Now build the new copy
dotnet build src/SwarmUI.csproj --configuration Release -o src/bin/live_release

for /f "delims=" %%i in ('git rev-parse HEAD') do set CUR_HEAD2=%%i
echo !CUR_HEAD2!> src/bin/last_build

timeout 3
