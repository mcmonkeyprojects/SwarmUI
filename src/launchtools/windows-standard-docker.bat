@echo off

rem Ensure correct local path.
cd /D "%~dp0/.."
set current_dir=%cd%

docker build -f launchtools/StandardDockerfile.docker -t swarmui .

rem add "--network=host" if you want to access other services on the host network (eg a separated comfy instance)
docker run -it --rm --name swarmui -v "%current_dir%"/Models:/SwarmUI/Models -v "%current_dir%"/Output:/SwarmUI/Output -v "%current_dir%"/src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows:/SwarmUI/src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows --mount source=swarmbackend,target=/SwarmUI/dlbackend --mount source=swarmdata,target=/SwarmUI/Data --mount source=swarmdlnodes,target=/SwarmUI/src/BuiltinExtensions/ComfyUIBackend/DLNodes --gpus=all -p 7801:7801 swarmui
