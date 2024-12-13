@echo off

rem Ensure correct local path.
cd /D "%~dp0/.."
set current_dir=%cd%

docker build -f launchtools/StandardDockerfile.docker -t swarmui .

rem add "--network=host" if you want to access other services on the host network (eg a separated comfy instance)
docker run -it --rm --name swarmui -v "%current_dir%"/Models:/Models -v "%current_dir%"/Output:/Output -v "%current_dir%"/src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows:/src/BuiltinExtensions/ComfyUIBackend/CustomWorkflows --mount source=swarmbackend,target=/dlbackend --mount source=swarmdata,target=/Data --gpus=all -p 7801:7801 swarmui
