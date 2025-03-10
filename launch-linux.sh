#!/usr/bin/env bash

# Ensure correct local path.
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

source ./launchtools/linux-path-fix.sh

# Server settings option
if [ -f ./src/bin/always_pull ]; then
    echo "Pulling latest changes..."
    git pull
fi

if [ -f ./src/bin/must_rebuild ]; then
    echo "Rebuilding..."
    rm -rf ./src/bin/live_release_backup
    mv ./src/bin/live_release ./src/bin/live_release_backup
    rm ./src/bin/must_rebuild
elif [ -d .git ]; then
    cur_head=`git rev-parse HEAD`
    built_head=`cat src/bin/last_build`
    if [ "$cur_head" != "$built_head" ]; then
        printf "\n\nWARNING: You did a git pull without building. Will now build for you...\n\n"
        rm -rf ./src/bin/live_release_backup
        mv ./src/bin/live_release ./src/bin/live_release_backup
    fi
else
    printf "\n\nWARNING: YOU DID NOT CLONE FROM GIT. THIS WILL BREAK SOME SYSTEMS. PLEASE INSTALL PER THE README.\n\n"
fi

# Build the program if it isn't already built
if [ ! -f src/bin/live_release/SwarmUI.dll ]; then
    dotnet build src/SwarmUI.csproj --configuration Release -o ./src/bin/live_release
    cur_head=`git rev-parse HEAD`
    echo $cur_head > src/bin/last_build
fi

# Default env configuration, gets overwritten by the C# code's settings handler
export ASPNETCORE_ENVIRONMENT="Production"
export ASPNETCORE_URLS="http://*:7801"

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
