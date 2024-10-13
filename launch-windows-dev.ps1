# Ensure correct local path.
$thisPath = Split-Path $MyInvocation.MyCommand.Path -Parent
cd $thisPath

# Visual Studio likes to generate invalid files here for some reason, so autonuke it
if (Test-Path "src/Properties/launchSettings.json") {
    rm src/Properties/launchSettings.json
}

# Nuke build files to ensure our build is fresh and won't skip past errors
Remove-Item 'src/bin/' -Recurse
Remove-Item 'src/obj/' -Recurse

# Building first is more reliable than running directly from src
dotnet build src/SwarmUI.csproj --configuration Debug -o src/bin/live_release

# Default env configuration, gets overwritten by the C# code's settings handler
$Env:ASPNETCORE_ENVIRONMENT = "Production"
$Env:ASPNETCORE_URLS = "http://*:7801"

# Actual runner.
.\src\bin\live_release\SwarmUI.exe --environment dev @args

# Exit code 42 means restart, anything else = don't.
if ($LASTEXITCODE -eq 42) {
    .\launch-windows-dev.ps1 @args
}
