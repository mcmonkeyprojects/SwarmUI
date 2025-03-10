#!/usr/bin/env bash

# This is the inner script for docker runs, don't run this directly, use launch-docker.sh instead.

cd /SwarmUI

# Add a fake home path, because docker defaults it to '/'
HOME=/SwarmUI/dlbackend/linuxhome

# Launch as normal, just ensure launch mode is off and host is global (to expose it out of the container)
bash /SwarmUI/launch-linux.sh $@ --launch_mode none --host 0.0.0.0
