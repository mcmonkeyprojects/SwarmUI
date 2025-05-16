#!/usr/bin/env bash

# No telemetry, no localization
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# Add dotnet non-admin-install to path
export PATH="$SCRIPT_DIR/.dotnet:$HOME/.dotnet:/usr/lib/dotnet:/usr/share/dotnet:$PATH"

# Try to set the expected runtime root by parsing dotnet cli output
if [ -z "$DOTNET_ROOT" ]; then
    runtime_path=$(dotnet --list-runtimes | head -n 1 | awk -F'[\\[\\]]' '{print $2}')
    if [ -d "$runtime_path" ]; then
        actual_path="$(dirname "$(dirname "$runtime_path")")"
        export DOTNET_ROOT="$actual_path"
        export DOTNET_ROOT_X64="$actual_path"
    fi
fi

# Fallback to a list of expected locations it could also be in
if [ -z "$DOTNET_ROOT" ]; then
    expected_location=(
        "$SCRIPT_DIR/.dotnet"
        "$HOME/.dotnet"
        "/usr/lib/dotnet"
        "/usr/share/dotnet"
        "/opt/homebrew/Cellar/dotnet/8.0.0/libexec"
        "/opt/homebrew/opt/dotnet/libexec"
    )

    for location in "${expected_location[@]}"; do
        if [ -d "$location" ]; then
            export DOTNET_ROOT="$location"
            export DOTNET_ROOT_X64="$location"
            break
        fi
    done
fi

if [ -z "$DOTNET_ROOT" ]; then
    echo "Could not find dotnet runtime path, please report on Discord @ https://discord.gg/q2y38cqjNw with info about your dotnet installation"
fi
