#!/usr/bin/env bash

# First arg is the target install dir, only "$HOME/.dotnet" and "$PWD/.dotnet" are fully supported by Swarm autodetect for launching
INSTALL_DIR="${1:-$HOME/.dotnet}"

# install dotnet
cd launchtools
rm dotnet-install.sh
# https://learn.microsoft.com/en-us/dotnet/core/install/linux-scripted-manual#scripted-install
wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh
chmod +x dotnet-install.sh
cd ..

./launchtools/dotnet-install.sh --channel 10.0 --runtime aspnetcore --install-dir "$INSTALL_DIR"
./launchtools/dotnet-install.sh --channel 10.0 --install-dir "$INSTALL_DIR"
./launchtools/dotnet-install.sh --channel 8.0 --runtime aspnetcore --install-dir "$INSTALL_DIR"
./launchtools/dotnet-install.sh --channel 8.0 --install-dir "$INSTALL_DIR"

rm ./launchtools/dotnet-install.sh
