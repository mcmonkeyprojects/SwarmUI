@echo off

rem Ensure correct local path.
cd /D "%~dp0/.."
set current_dir=%cd%

docker build -f launchtools/OpenDockerfile.docker -t swarmui .

rem add "--network=host" if you want to access other services on the host network (eg a separated comfy instance)
docker run -it --rm --name swarmui -v "%current_dir%":/SwarmUI --gpus=all -p 7801:7801 swarmui
