#!/usr/bin/env bash

# Ensure correct local path.
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

source ./launchtools/linux-build-logic.sh

# Allow restarting to be forwarded (for docker)
FORWARD_RESTART=""
if [ "$1" == "--forward_restart" ]; then
    FORWARD_RESTART="true"
    shift
fi

# Actual runner.
./src/bin/live_release/SwarmUI $@

# Exit code 42 means restart, anything else = don't.
if [ $? == 42 ]; then
    if [ "$FORWARD_RESTART" == "true" ]; then
        exit 42
    else
        exec ./launch-linux.sh $@
    fi
fi
