#!/usr/bin/env bash

source ./launchtools/linux-path-fix.sh

# Install dotnet 10 if we're in a swarm-installed dotnet path and 10 isn't installed yet (because of legacy dotnet 8 installs)
if [ "$DOTNET_ROOT" = "$SCRIPT_DIR/.dotnet" ] || [ "$DOTNET_ROOT" = "$HOME/.dotnet" ]; then
    if ! dotnet --list-sdks 2>/dev/null | grep -q "^10\.0"; then
        echo "Installing dotnet 10 to user-local dir, if you don't want this you have 15 seconds to CTRL+C this terminal, then go manually install dotnet 10"
        sleep 15
        ./launchtools/linux-dotnet-install.sh "$DOTNET_ROOT"
    fi
fi

mkdir -p ./src/bin

# Server settings option
if [ -f ./src/bin/always_pull ]; then
    echo "Pulling latest changes..."
    git pull
fi

if [ -d .git ]; then
    cur_head=`git rev-parse HEAD`
    built_head=`cat src/bin/last_build 2>/dev/null`
    if [ "$cur_head" != "$built_head" ]; then
        printf "\n\nWARNING: You did a git pull without building. Will now build for you...\n\n"
        touch ./src/bin/must_rebuild
    fi
else
    printf "\n\nWARNING: YOU DID NOT CLONE FROM GIT. THIS WILL BREAK SOME SYSTEMS. PLEASE INSTALL PER THE README.\n\n"
    sleep 5
fi

if [ -f ./src/bin/must_rebuild ]; then
    echo "Rebuilding..."
    if [ -d ./src/bin/live_release ]; then
        rm -rf ./src/bin/live_release_backup
        mv ./src/bin/live_release ./src/bin/live_release_backup
    fi
    rm -rf ./src/bin/extensions
    rm ./src/bin/must_rebuild
fi

# Build the program if it isn't already built
if [ ! -f src/bin/live_release/SwarmUI.dll ]; then
    dotnet build src/SwarmUI.csproj --configuration Release -o ./src/bin/live_release
    cur_head=`git rev-parse HEAD`
    echo $cur_head > src/bin/last_build
fi

if [ ! -f src/bin/live_release/SwarmUI.dll ] && [ -f src/bin/live_release_backup/SwarmUI.dll ]; then
    printf "\n\nWARNING: BUILD FAILED? Restoring backup...\n\n"
    sleep 5
    rm -rf ./src/bin/live_release
    mv ./src/bin/live_release_backup ./src/bin/live_release
fi

# Default env configuration, gets overwritten by the C# code's settings handler
export ASPNETCORE_ENVIRONMENT="Production"
export ASPNETCORE_URLS="http://*:7801"
