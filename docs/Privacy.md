# Privacy of SwarmUI

SwarmUI is free-and-open-source pure-local runnable software. That means, in short, the answer to "Swarm has good privacy?" is "Yes Swarm is very private."

## Longer Answer

### The Good News

- Swarm itself has no native autoenabled phone home nor data tracking.
- Swarm has a variety of dependencies, none of which *should* be phoning home.
- Swarm actively emits multiple environment variables telling all known phone-homer dependencies to shut up and not do that (eg `DISABLE_TELEMETRY` to disable HuggingFace telemetry, `YOLO_OFFLINE` to disable Ultralytics YOLOv8 segment model telemetry, etc.)
- Swarm literally does not have any central servers to contact. The rare cases where remote connections are needed (see below) are to general public services from other providers (eg GitHub).
- As long as you're running locally, your prompts, generated images, etc. are never sent to remote servers.
- Swarm's primary backend provider, ComfyUI, is developed by an author who has consistently maintained a similar stance of pure privacy and has made a public promise that ComfyUI will never phone home.

### The Considerations

- Naturally when installing, you pull software from `github.com`, `pypi` servers, `nuget` servers, etc.
- Swarm will generally try to auto-update ComfyUI and custom nodes, this will perform a `git pull` to `github.com`, which GitHub has anonymous statistic counters for events.
    - You can disable auto updating in Server->Backends->edit the backend->disable AutoUpdate
- Swarm does not auto-update itself by default (though you can enable this), but you can manual update in a couple clicks, and this of course downloads from `github.com` and `nuget` servers
- Swarm cannot rigidly guarantee no dependencies ever phone home. If you discover any start doing that, please report it immediately on the SwarmUI GitHub issues page or Discord, we will take corrective action.
- If you run on a remote server, obviously the provider of that server has access to your data, and potentially the networking in between may be interceptable.
    - Notably for example if you use CloudFlare Tunnels, CloudFlare may be able to scan your data.
- If you open your server to public or external access, remote users of course can read the data available through the Swarm instance.
- When installing custom nodes or Swarm extensions, they may have their own functionality, which may make remote connections.
    - For Swarm Extensions, Swarm [has a rule](/docs/Making%20Extensions.md) against unnecessary web connections (but allows necessary ones).
