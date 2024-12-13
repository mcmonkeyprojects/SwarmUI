#!/usr/bin/env bash

# Note: This is an example file, do not edit `launch-standard-docker.sh`. Instead, duplicate the file and edit your duplicate.
# `custom-launch-docker.sh` is reserved in gitignore for if you want to use that.

# Run script automatically in Swarm's dir regardless of how it was triggered
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR/.."

docker build -f launchtools/StandardDockerfile.docker -t swarmui .

# add "--network=host" if you want to access other services on the host network (eg a separated comfy instance)
docker run -it \
    --rm \
    --name swarmui \
    --mount source=swarmdata,target=/Data \
    --mount source=swarmbackend,target=/dlbackend \
    -v ./Models:/Models \
    -v ./Output:/Output \
    -v ./src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows:/src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows \
    --gpus=all -p 7801:7801 swarmui
