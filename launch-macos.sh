#!/usr/bin/env bash

# Ensure correct local path.
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

# Try to encourage Mac to use the correct python version (ie don't use global default which is often 3.13 for mac users, instead use 11, 12, or 10)
export PATH="/opt/homebrew/opt/python@3.11/libexec/bin:/opt/homebrew/opt/python@3.12/libexec/bin:/opt/homebrew/opt/python@3.10/libexec/bin:$PATH"

# PyTorch MPS fallback to CPU, so incompatible comfy nodes can still work.
export PYTORCH_ENABLE_MPS_FALLBACK=1

source ./launchtools/linux-build-logic.sh

# Actual runner.
./src/bin/live_release/SwarmUI $@

# Exit code 42 means restart, anything else = don't.
if [ $? == 42 ]; then
    . ./launch-macos.sh $@
fi
