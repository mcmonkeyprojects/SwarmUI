#!/usr/bin/env bash

# install dotnet
cd launchtools
rm dotnet-install.sh
# https://learn.microsoft.com/en-us/dotnet/core/install/linux-scripted-manual#scripted-install
wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh
chmod +x dotnet-install.sh
cd ..

# Note: manual installers that want to avoid home dir, add to both of the below lines: --install-dir "$PWD/.dotnet"
./launchtools/dotnet-install.sh --channel 10.0 --runtime aspnetcore
./launchtools/dotnet-install.sh --channel 10.0
./launchtools/dotnet-install.sh --channel 8.0 --runtime aspnetcore
./launchtools/dotnet-install.sh --channel 8.0

rm ./launchtools/dotnet-install.sh
