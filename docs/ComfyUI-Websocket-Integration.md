# ComfyUI WebSocket Integration Notes

Purpose: concise guidance for developers integrating with ComfyUI's realtime websocket messages. These notes explain the key message types used during generation so backends or frontends can display per-node progress and current node information.

- WebSocket endpoint: `/ws` on the ComfyUI server (e.g. `ws://localhost:8188/ws`). Clients send a first message of type `feature_flags` to negotiate capabilities; server responds with its supported features.

- Message types to listen for during generation:
  - `progress`: Sent by ComfyUI to report progress inside a long-running node (eg sampler). Fields:
    - `value`: current progress value (integer)
    - `max`: total progress value (integer)
    - optional: `prompt_id`, `node` (id), `preview_image`
    - Example payload:
      {
        "type": "progress",
        "data": { "value": 30, "max": 100, "prompt_id": "...", "node": "12" }
      }

  - `executing`: Sent when execution starts for a specific node. Use this to identify which node id is currently being processed. Fields:
    - `node`: the node id (string)
    - `prompt_id`: the prompt/workflow id
    - Example payload:
      {
        "type": "executing",
        "data": { "node": "12", "prompt_id": "..." }
      }

- How to combine messages to show per-stage progress:
  1. When you receive `executing` for `node` N, set the current node to `N`.
  2. When you receive `progress` while current node == N, compute stage percent = `value / max` and display it.
  3. When `executed` or a `progress` with `value == max` arrives, mark the node done and wait for the next `executing`.

- Payload variations and tips:
  - Some nodes may emit `max` values reserved for non-image outputs. Check `max` values carefully and guard against invalid divisions.
  - ComfyUI may also send binary/image frames on the same websocket; inspect the message prefix (`{"type":` vs raw bytes) to distinguish JSON messages from raw media frames.
  - The `node` value may be a numeric id (e.g. `"12"`). If you want a friendly label, request node metadata (`/object_info` or workflow JSON) from the ComfyUI HTTP API or map ids to labels in your client.

- Example: UI update loop
  - On `executing` -> set `current_node = data.node`; update label to `Node <id>` (or `Node <id> — <label>` if you have a label mapping).
  - On `progress` -> if `data.node == current_node` update per-stage progress bar to `data.value / data.max` and optionally show `data.preview_image`.

These conventions are what SwarmUI expects when integrating with ComfyUI backends. If you're implementing a backend adapter or UI, use the `node` + `progress` pairing to show accurate node-level progress steps.
