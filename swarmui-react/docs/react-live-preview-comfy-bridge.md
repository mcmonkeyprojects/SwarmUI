# React Live Preview and Comfy Bridge Notes

React generation previews should use Swarm's `GenerateText2ImageWS` route by default. The C# backend already consumes ComfyUI websocket preview frames and forwards them as `gen_progress.preview`, which keeps Swarm session checks, backend selection, interrupt handling, and request scoping in one place.

The React frontend should treat `data:` preview frames as live transient frames. These frames are already decoded enough to be displayed by the browser, so they should not wait behind URL preload/decode behavior intended for normal image URLs.

## Direct Comfy Bridge

`ComfyBackendDirect` can proxy Comfy websocket traffic to a browser client, so a more direct bridge is possible. It should remain a future advanced or diagnostic path unless the Swarm-mediated preview stream proves insufficient.

A direct bridge would need to solve several problems that `GenerateText2ImageWS` already handles:

- Correlating Comfy prompt IDs, Swarm request IDs, and React generation IDs.
- Preserving Swarm permissions, session recovery, multi-backend routing, and queue behavior.
- Parsing Comfy binary preview frames in React or exposing another browser-safe frame format.
- Handling interrupt, reconnect, stale-frame rejection, and final image replacement consistently with normal generation.

For parity work, prefer improving the existing React display pipeline before adding a direct Comfy connection.
