---
name: invokeai-react-bridge
description: Use when extending the React frontend with InvokeAI connection, generation, or canvas editing support.
---

# InvokeAI React Bridge

Use this skill when adding or maintaining InvokeAI features in the React frontend.

## When to Use

- Adding InvokeAI connection, model listing, health checks, or queue polling.
- Sending Swarm canvas or gallery images to InvokeAI for img2img, inpaint, outpaint, or refinement.
- Saving InvokeAI results back into the existing Swarm gallery/history flow.

## Instructions

- Keep InvokeAI isolated from the primary Swarm/Comfy generation path. Do not route normal Generate tab batching or Comfy workflow execution through InvokeAI.
- Treat InvokeAI as an editing bridge: canvas workflows, mask-driven edits, outpaint bounds, and lightweight utility txt2img.
- Prefer frontend modules under `src/features/invokeai/` for InvokeAI-specific client, graph, and state code.
- Use InvokeAI API v1 for app status, image upload, queue enqueue/polling, and image download:
  - `GET /api/v1/app/version`
  - `POST /api/v1/images/upload`
  - `POST /api/v1/queue/default/enqueue_batch`
  - `GET /api/v1/queue/default/i/{item_id}`
  - `GET /api/v1/images/i/{image_name}/full`
- Use InvokeAI API v2 for model listing with `GET /api/v2/models/?model_type=main`.
- Save completed InvokeAI outputs through Swarm's existing `AddImageToHistory` API and invalidate image queries so gallery behavior stays consistent.
- For canvas editing, reuse `CanvasApplyPayload` fields:
  - `initImageDataUrl` or `sourceImageUrl` for the source image.
  - `maskDataUrl` for inpaint/outpaint masks.
  - `hasOutpaintCanvas` to distinguish outpaint-style expanded canvas edits.
- Keep generated InvokeAI graphs intentionally basic unless the task explicitly asks for deeper Invoke workflow support. Do not attempt feature parity with Swarm/Comfy.
