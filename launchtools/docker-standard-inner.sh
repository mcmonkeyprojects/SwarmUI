#!/usr/bin/env bash

# This is the inner script for docker runs, don't run this directly, use launch-docker.sh instead.

cd /SwarmUI

# Arg to fix the permissions (from legacy root)
if [[ "$1" == "fixch" ]]
then
    echo "Fixing perms, owning to UID $2"
    chown -R $2:$2 /SwarmUI/dlbackend /SwarmUI/Data /SwarmUI/src /SwarmUI/Output
    chown $2:$2 /SwarmUI
    # Scrap any database files rather than reperm (to reduce conflicts, they regen anyway)
    rm /SwarmUI/Models/**/model_metadata.ldb 2> /dev/null
    echo "Perms fixed, launch as normal now"
    exit
fi

# Check to see if a 'fixch' call is needed
if [ "$EUID" -ne 0 ] && [ "$(stat -c '%U' "/SwarmUI/dlbackend")" = "root" ]
then
    echo "Detected folder ownership issue. Please run the docker script as './launchtools/launch-standard-docker.sh fixch' to fix permissions."
    echo "(This happens because the script used to run as root inside the docker, but it now runs as your local user)"
    exit
fi

# Add a fake home path, because docker defaults it to '/'
HOME=/SwarmUI/dlbackend/linuxhome

# Launch as normal, just ensure launch mode is off and host is global (to expose it out of the container)
bash /SwarmUI/launch-linux.sh $@ --launch_mode none --host 0.0.0.0
