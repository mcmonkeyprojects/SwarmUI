#!/usr/bin/env bash

# Ensure correct local path.
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

# Add dotnet non-admin-install to path
export PATH="$SCRIPT_DIR/.dotnet:~/.dotnet:$PATH"

export DOTNET_CLI_TELEMETRY_OPTOUT=1

# The actual update
git pull

# Make a backup of the current live_release to be safe
if [ -d ./src/bin/live_release ]; then
    rm -rf ./src/bin/live_release_backup
    mv ./src/bin/live_release ./src/bin/live_release_backup
fi

# Now build the new copy
dotnet build src/SwarmUI.csproj --configuration Release -o ./src/bin/live_release

cur_head=`git rev-parse HEAD`
echo $cur_head > src/bin/last_build
