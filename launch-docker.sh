#!/usr/bin/env bash

docker build -t swarmui .

# add "--network=host" if you want to access other services on the host network (eg a separated comfy instance)
docker run -it \
    --name swarmui \
    --mount source=swarmdata,target=/Data \
    --mount source=swarmbackend,target=/dlbackend \
    -v ./Models:/Models \
    -v ./Output:/Output \
    -v ./src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows:/src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows \
    --gpus=all -p 7801:7801 swarmui
