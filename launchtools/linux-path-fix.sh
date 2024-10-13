#!/usr/bin/env bash

# Add dotnet non-admin-install to path
export PATH="$SCRIPT_DIR/.dotnet:~/.dotnet:$PATH"

# Set the expected runtime root
if [ -d "$SCRIPT_DIR/.dotnet" ]; then
    export DOTNET_ROOT="$SCRIPT_DIR/.dotnet"
elif [ -d "~/.dotnet" ]; then
    export DOTNET_ROOT="~/.dotnet"
fi

export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
