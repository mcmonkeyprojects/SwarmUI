#!/usr/bin/env bash

# Ensure correct local path (repo root).
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR/.."
SCRIPT_DIR=$( pwd )

source ./launchtools/linux-path-fix.sh

dotnet test SwarmUITests/SwarmUITests.csproj --configuration Release
