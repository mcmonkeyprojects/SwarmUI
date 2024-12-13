#!/usr/bin/env bash

# This is the inner script for docker runs, don't run this directly, use launch-docker.sh instead.

cd /SwarmUI

# Docker instance runs as root, so tell it to copy the group owner of folders to hopefully make it more accessible.
# Unfortunately, "u+s" does not do the same thing for copying the user for some reason, so we're stuck with root owning files (maybe we could jankily direct port the host's uid? but, ew.)
chmod g+s /SwarmUI /SwarmUI/**/

# Launch as normal, just ensure launch mode is off and host is global (to expose it out of the container)
bash /SwarmUI/launch-linux.sh --launch_mode none --host 0.0.0.0
