#!/usr/bin/env bash

# Ensure correct local path.
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

# Add dotnet non-admin-install to path
export PATH="$SCRIPT_DIR/.dotnet:~/.dotnet:$PATH"

export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# Cycle build folder forward
rm -rf ./src/bin/live_release_backup
mv ./src/bin/live_release ./src/bin/live_release_backup
rm ./src/bin/must_rebuild
rm ./src/bin/last_build

# Build the program
dotnet build src/SwarmUI.csproj --configuration Debug -o ./src/bin/live_release

# Default env configuration, gets overwritten by the C# code's settings handler
export ASPNETCORE_ENVIRONMENT="Production"
export ASPNETCORE_URLS="http://*:7801"
# Actual runner.
./src/bin/live_release/SwarmUI $@
