#!/usr/bin/env bash

# Ensure correct local path.
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

# Try to encourage Mac to use the correct python version (ie don't use global default which is often 3.13 for mac users, instead use 11, 10, or 12)
export PATH="/opt/homebrew/opt/python@3.11/libexec/bin:/opt/homebrew/opt/python@3.10/libexec/bin:/opt/homebrew/opt/python@3.12/libexec/bin:$PATH"

source ./launchtools/linux-path-fix.sh

# Building first is more reliable than running directly from src
dotnet build src/SwarmUI.csproj --configuration Release -o ./src/bin/live_release
# Default env configuration, gets overwritten by the C# code's settings handler
ASPNETCORE_ENVIRONMENT="Production"
ASPNETCORE_URLS="http://*:7801"

# PyTorch MPS fallback to CPU, so incompatible comfy nodes can still work.
export PYTORCH_ENABLE_MPS_FALLBACK=1

# Actual runner.
./src/bin/live_release/SwarmUI $@
