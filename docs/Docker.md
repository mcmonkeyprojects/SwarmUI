# Using SwarmUI in Docker

This document explains why and how to use SwarmUI in a Docker container. This is primarily intended for advanced users. If you've never used a Linux terminal before, this is likely too complicated for you.

# Table of Contents

- [Why Use Docker](#why-use-docker)
- [Options](#options)
    - [Standard Contained Installation](#standard-contained-installation)
    - [Open Passthrough Installation](#open-passthrough-installation)
    - [Customizing](#customizing)
    - [Which To Pick](#which-to-pick)
- [How To](#how-to)
    - [Linux](#linux)
    - [Windows](#windows)
    - [Mac](#mac)
- [Docker Compose](#docker-compose)
- [Advanced Usage, Notes, Troubleshooting](#advanced-usage-notes-troubleshooting)

# Why Use Docker

**What is Docker?** [Docker](https://www.docker.com/) is a containerization tool: That is, it lets you run software in a "restricted container" - a virtual machine inside your computer, a separation layer between where the software is running, and where everything else is running.

**What is the actual practical benefit?** Security, mainly. If anything unwanted happens inside your Swarm instance, it's limited to that container, and you can easily cut it off, and trust with decent confidence\* that it didn't access anything outside.

\*(Docker is not a guarantee, it just makes it a lot harder for malicious activity to escape. A targeted attack for example might escape through internal network access.)

**Does this mean Swarm is unsafe?** Well, no. Swarm is safe. ... Buuuut, Swarm does not stand up all by itself. Swarm depends on a ComfyUI backend. ComfyUI depends on python3, and a variety of python packages. You might install custom nodes from any number of third party developers. Those nodes, in turn, depend on a variety of other python packages. The risk here is referred to as a "supply chain attack": The software you're trying to use, Swarm, is safe, but a dependency of a dependency of a dependency might be maintained by [some random person from Nebraska who has been thanklessly maintaining it since 2003](https://xkcd.com/2347/), and that guy might have his account taken over, and malware slipped into his project. This is rare, but it has happened, and has even happened to projects depended on by Comfy & Swarm users ([see for example Ultralytics breach notes here](https://github.com/mcmonkeyprojects/SwarmUI/releases/tag/0.9.4.0-Beta) - this attack thankfully ended up damaging zero of our users, and was detected & addressed by Swarm & Comfy developers within hours, but it hurt non-Swarm-users, and the next attack might not leave us so lucky).

**So doing this Docker thingy makes it safe?** Well not entirely, but mostly yeah. Docker removes the majority of available attack surface, but nothing is ever a guarantee. Even with a Docker setup, always only install extensions or custom nodes from respected well known developers to minimize risk. This is also not a substitute for practicing good security in general (backup your important files externally, don't reuse passwords between sites, always use TFA, etc. -- when all is done well, even a successful hack targeting you can't do you too much harm). See also Docker's security documentation: https://docs.docker.com/engine/security/

**Are there alternatives to Docker?** Yes! There's plenty of containerization methods, Docker is just a well known one that Swarm has references for. If you're paranoid, you might use an entirely different machine for anything private/secure (such as accessing your bank accounts or whatever) from where you run general local software (anything like Swarm or other AI tools included). If you're on Windows and don't want to split your machine or deal with Docker, there's other "sandbox" tools such as [Sandboxie](https://sandboxie-plus.com/) that oughtta work as well.

**Any bonus perks of Docker?** A few. Some better control over the process, some general management perks, better assurance of privacy, the ability to destroy your instance data and remake it quickly (like a reinstall but easier, for if you're the type of person to break your install often). On Windows you may end up with slightly faster backend performance (thanks to everything just kinda running better with Linux drivers than Windows ones). On Linux it may make for a more reliable installation since Swarm will have independence from any global package installs (you don't have to worry about your global python install if Swarm has a container with its own python install).

# Options

## Standard Contained Installation

The standard contained installation will precompile Swarm in the build stage, and create independent persistent volumes for `Data` and `dlbackend`, as well as forwarding `Models` and `Output` folders directly.

This makes it easy to run multiple instances from one Swarm install, but is a bit more annoying for if you need to directly access the underlying files.

## Open Passthrough Installation

The "open passthrough" container installation will simply run Swarm in-place, but as a container. This is a bit less rigid and proper, but may be more convenient for personal usage.

It should still be relatively secure, but a targeted attack could mess with things (eg alter the docker files to cause a problem on next launch).

You probably shouldn't do a passthrough of a pre-existing install unless you know what you're doing, as the python environment is likely to be corrupted - the container and the host cannot share control of a python env folder without something going haywire.

Be aware that the permissions on files may be weird, as the container will treat files as owned by root, so if you want to access them from host you'll have to use `sudo chown yournamehere:yournamehere -R ./` first (won't break anything in the container).

Open Passthrough is very much not recommended on Windows, the Linux+Windows interaction in a folder will lead to weird results, use at your own risk.

## Customizing

If you have more specific needs, such as alternate folders to forward (eg if you have models on a different drive) or forward alternate ports or etc, you can simply copy the `launch-standard-docker.sh` or `launch-open-docker.sh` file, name your copy `custom-launch-docker.sh`, and put whatever modifications you want inside (do not edit the original script, to avoid git conflicts). Then, of course, simply use your edited copy.

You shouldn't need to edit the Dockerfiles, the difference between Standard vs Open is just Standard copies in source files, and Open does not, so pick whichever of the two makes more sense for your situation.

You can mount a models directory with `:ro` on the end to make it readonly. Just be sure to disable "Model Metadata Per Folder" in server configuration if you mount a Models folder this way, and understand that "Edit Metadata" won't work if you do this.

## Which To Pick

If in doubt, go with Standard, that's why it's named that. But if Open sounds right for you, go for it. Or, if you know what you're doing with Docker and want to maximize security and control, make your own docker container. The docker files include here should serve as great starting point examples.

# How To

The steps are similar for all OS's, with different setup requirements.

In all cases you don't need to be an expert, but will need a bit of familiarity with basic operation of a command line interface. Unfortunately Docker is not quite "plug-n-play", but it's getting close.

## Linux

- Install Docker Engine for Linux: https://docs.docker.com/engine/install/
    - You don't need Docker Desktop, just the Engine
- Follow the Docker Linux post-install steps to ensure you can operate Docker from a user account instead of root: https://docs.docker.com/engine/install/linux-postinstall/
    - (Optional) if you want to further refine your security, you can configure Docker rootless mode: https://docs.docker.com/engine/security/rootless/
        - Rootless has known unresolved issues in base Docker currently. I do not recommend using it until these are patched.
        - If you must, you'll need to maintain modified copies of the docker scripts that remove the `--user` inputs (ie rootless docker currently requires you run as root inside the container. This is obviously not good, thus the advice to not use rootless for now. See https://github.com/mamba-org/micromamba-docker/issues/407#issuecomment-2088523507 for info.)
- Install and enable NVIDIA Container toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
- Install `git`
- Download Swarm via git: `git clone https://github.com/mcmonkeyprojects/SwarmUI`
- cd `SwarmUI`
- Run `./launchtools/launch-standard-docker.sh` or `./launchtools/launch-open-docker.sh`. Do not give it any CLI args.
- Open a browser to http://localhost:7801

## Windows

- Install Docker Desktop for Windows: https://docs.docker.com/desktop/setup/install/windows-install/
    - Be warned this has a lot of prerequisites, including BIOS settings and Windows WSL2 activation. Be prepared for a long and annoying process if you've never done this before. Sorry.
    - It's also pretty buggy from my own testing. (Maybe a Docker expert can help improve this?)
- Install git from https://git-scm.com/download/win
- open a terminal to the folder you want swarm in and run `git clone https://github.com/mcmonkeyprojects/SwarmUI`
- Open the `launchtools` folder and doubleclick either `windows-standard-docker.bat` or `windows-open-docker.bat`
- Open a browser to http://localhost:7801

## Mac

Mac information is currently untested, but presumed to work fairly similar to Linux as long as you get Docker installed on your Mac per Docker's documentation.

- Install Docker Desktop for Mac: https://docs.docker.com/desktop/setup/install/mac-install/
- Install `git`
- Download Swarm via git: `git clone https://github.com/mcmonkeyprojects/SwarmUI`
- cd `SwarmUI`
- Run `./launchtools/launch-standard-docker.sh` or `./launchtools/launch-open-docker.sh`. Do not give it any CLI args.
- Open a browser to http://localhost:7801

# Docker-Compose

If you're a "docker compose" fan, there is an included example docker compose file you can use as usual, which is equivalent to the "standard" option above.

- Copy the `launchtools/example-docker-compose.yml` to `docker-compose.yml` in the Swarm root, optionally edit the contents (eg add other drives)
- Run it via `HOST_UID="$(id -u)" HOST_GID="$(id -g)" docker compose up`
- You should probably `docker compose rm` after

If you're not an active "docker compose" fan that needs it for some reason, I do not recommend it.

# Advanced Usage, Notes, Troubleshooting

- If you need to access a shell inside the Docker container while it's running, use `docker exec -it swarmui bash -l`
    - To install pip packages, first `cd /SwarmUI/dlbackend/ComfyUI` then `./venv/bin/python -s -m pip install ...`
- Everything goes under `/SwarmUI` inside the container
- If you have an AMD or Intel GPU... uh, there's probably appropriate tooling for that. No idea what it is, good luck. (If you have such a GPU and find the answers to that, please PR docs about it!)
- The "Standard" container runs as your own current user inside the container. Historically it originally ran as root, so you can run the script with `fixch` as the only arg to have it run as root and chown everything over.
    - For the "Open" dockerfile, if needed, just `sudo chown -R $UID:$UID ./` inside the SwarmUI folder, since permissions are just a raw passthrough anyway.

<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>
