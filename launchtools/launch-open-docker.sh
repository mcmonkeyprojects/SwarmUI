#!/usr/bin/env bash

# Note: This is an example file, do not edit `launch-open-docker.sh`. Instead, duplicate the file and edit your duplicate.
# `custom-launch-docker.sh` is reserved in gitignore for if you want to use that.

# Run script automatically in Swarm's dir regardless of how it was triggered
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR/.."

docker build -f launchtools/OpenDockerfile.docker -t swarmui .

# add "--network=host" if you want to access other services on the host network (eg a separated comfy instance)
docker run -it \
    --rm \
    --user $UID:$(id -g) --cap-drop=ALL \
    --name swarmui \
    -v ./:/SwarmUI \
    --gpus=all -p 7801:7801 swarmui $@
