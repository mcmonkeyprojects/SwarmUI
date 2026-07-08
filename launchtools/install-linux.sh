#!/usr/bin/env bash

# Ensure correct local path.
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

# Accidental run prevention
if [ -d "SwarmUI" ]; then
    echo "SwarmUI already exists in this directory. Please remove it before installing."
    exit 1
fi
if [ -f "SwarmUI.sln" ]; then
    echo "SwarmUI already exists in this directory. Please remove it before installing."
    exit 1
fi

# Download swarm
git clone https://github.com/mcmonkeyprojects/SwarmUI
cd SwarmUI

# install dotnet
# Note: manual installers that want to avoid home dir, you can change the path below to "$PWD/.dotnet"
./launchtools/linux-dotnet-install.sh "$HOME/.dotnet"

# Launch
./launch-linux.sh "$@"
