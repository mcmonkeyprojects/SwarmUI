---
name: workflow-generator
description: Add or modify SwarmUI's C# WorkflowGenerator, including ordered generation steps, reusable graph helpers, WGNodeData media routing, model-specific behavior, Comfy node contracts, and feature gating.
---

# Workflow Generator

## When To Use

- Use this skill when changing WorkflowGenerator, the C# code that translates `T2IParamInput` into a ComfyUI API workflow.

## Relevant Paths

- `src/BuiltinExtensions/ComfyUIBackend/WorkflowGenerator.cs`: generator state, reusable graph-building functions, `CreateNode`, `NodePath`, graph inspection/rewriting, and `Generate`.
- `src/BuiltinExtensions/ComfyUIBackend/WorkflowGeneratorSteps.cs`: the ordered core pipeline, model-generation hooks, reserved node IDs, and final cleanup.
- `src/BuiltinExtensions/ComfyUIBackend/WorkflowGeneratorModelSupport.cs`: model/compatibility detection, model and text-encoder loading, VAEs, and model-specific empty latents.
- `src/BuiltinExtensions/ComfyUIBackend/WGNodeData.cs`: typed references to node outputs, media metadata, latent/raw conversion, attached audio, and output saving.
- `src/BuiltinExtensions/ComfyUIBackend/ComfyUIBackendExtension.cs`: Comfy parameters, discovered features, and `NodeToFeatureMap`.
- `src/BuiltinExtensions/ComfyUIBackend/ComfyUIAPIAbstractBackend.cs`: backend `object_info`, available node types, feature set passed into the generator, and workflow submission.

## Understand the Node Contract

`CreateNode` emits `{ "class_type": ..., "inputs": ... }`; connections are `[node ID, output index]`, preferably built with `NodePath`. Before using a node, verify its exact class name, input names/types, outputs, and output indexes at its source:

- `src/BuiltinExtensions/ComfyUIBackend/ExtraNodes/SwarmComfyCommon/`: Swarm-owned Python nodes. Registration is in each file's `NODE_CLASS_MAPPINGS`, combined by `__init__.py`.
- `dlbackend/comfy/`: downloaded upstream ComfyUI, including core and `comfy_extras` nodes.
- `src/BuiltinExtensions/ComfyUIBackend/DLNodes/`: downloaded third-party custom-node repositories.

Never modify `dlbackend/` or `DLNodes/`; they are downloaded upstream code. Add a Swarm-owned node only under `ExtraNodes` and register it in the relevant mapping. Third-party nodes require an appropriate discovered feature check; update feature discovery/installation declarations only when the requested feature needs it. Respect `RestrictCustomNodes` where a core-node fallback is possible.

## Find and Choose Nodes

Start from the requested behavior and data type, not a guessed node name:

1. Search `WorkflowGenerator*` and `WGNodeData` for existing helpers and similar `CreateNode` calls. Prefer an existing high-level function: for example, a request to save audio should lead to `WGNodeData.SaveOutput`, not a new save sequence.
2. If the node name is known, search all three Python source locations for the exact name. For legacy nodes, the key in `NODE_CLASS_MAPPINGS` is the `class_type`; follow its mapped class and inspect `INPUT_TYPES`, `RETURN_TYPES`, `FUNCTION`, and `OUTPUT_NODE`. For newer nodes, inspect `define_schema`: `node_id` is the `class_type`, and `inputs`/`outputs` define the connection contract; confirm the class is returned by its `ComfyExtension.get_node_list`/`comfy_entrypoint`.
3. If no node name is known, search Python for several behavior synonyms and the data type. Useful discovery fields include class and mapping names, `SEARCH_ALIASES`/`search_aliases`, `CATEGORY`/`category`, `DESCRIPTION`/`description`, and display names.
4. Search in this order: Swarm `ExtraNodes`, upstream `dlbackend/comfy/nodes.py`, upstream `dlbackend/comfy/comfy_extras/nodes_*.py`, then third-party `DLNodes`. If a `DLNodes` repository is absent, use `src/Core/InstallableFeatures.cs` and extension calls to `RegisterInstallableFeature` to identify its source repository.
5. Compare candidates by semantics and availability. Prefer an existing generator/WGNodeData helper, then a new AddNode when it provides the behavior. Use a Swarm node when one is available, a core comfy node otherwise, and a third-party node only when necessary and with installation and feature gating accounted for.

Real examples: `SwarmImageScaleForMP` maps to its class in `ExtraNodes/SwarmComfyCommon/SwarmImages.py`; core `ImageScale` is mapped in `dlbackend/comfy/nodes.py`; `LTXVEmptyLatentAudio` is schema-defined and registered in `dlbackend/comfy/comfy_extras/nodes_lt_audio.py`. Audio output in `WGNodeData.SaveOutput` chooses Swarm's `SwarmSaveAudioWS` from `SwarmSaveImageWS.py` when `comfy_saveaudio_ws` is available, otherwise upstream `SaveAudioAdvanced` from `comfy_extras/nodes_audio.py`.

## Steps Versus Functions

- Use `AddStep` only for behavior that is a core part of the generated workflow, usually directly mapped from user input. Choose its priority by reading the neighboring steps whose state it consumes and produces; do not guess from the old summary comment alone.
    - Usually just work inside existing steps, rather than adding new ones.
- Use `AddModelGenStep` only for behavior that must run while each base/refiner/other model is loaded. Account for `LoadingModelType`, stage flags, section IDs, and the possibility that this hook runs multiple times.
- Put reusable node sequences and transformations in a focused `WorkflowGenerator` function.
    - Usually these minimize direct reads to broad user input parameters in favor of method parameters, but may include generalized user parameters such as data format preferences.
- Put model detection/loading behavior in `WorkflowGeneratorModelSupport.cs`.
- Put representation-aware media behavior in `WGNodeData`. A function should not become a step merely because one step currently calls it.
- A step must update the relevant passthrough state (eg `CurrentModel`, `CurrentTextEnc`, `CurrentVae`, `CurrentAudioVae`, `CurrentMedia`, or conditioning fields). Merely creating an unconnected node has no effect.

## Use WGNodeData

Prefer `WGNodeData` over passing bare `JArray` paths for models and media. It carries the data type, model compatibility, dimensions, frame count/FPS, and attached audio.

- Use `WithPath` when a node replaces a value while preserving its metadata; pass a new data type when the representation changes.
- Use `AsSamplingLatent`, `AsLatentImage`, `AsRawImage`, `EncodeToLatent`, `DecodeLatents`, and `SaveOutput` instead of duplicating conversion or save logic.
    - Use these `AsX`/`Encode`/`Decode` when you expect a specific format, they are a safe no-op if the data is already in the right format.
- Construct a new `WGNodeData` with the correct type and compatibility when introducing a new independent output. Set or clear width, height, frames, FPS, and attached audio when the operation changes them.
- Use `WGAssert` for internal graph/type invariants. Use `SwarmUserErrorException` for invalid user choices or unavailable requested capabilities.

## Make a Safe Change

1. Trace the parameter from registration through `UserInput.Get`/`TryGet` to the step and helper that consume it. Use the `t2i-parameter-handling` skill when changing parameter definitions.
2. Identify the earliest state the feature needs and the state it must replace. Select a step priority from the actual surrounding registrations.
3. Verify every Comfy node contract at its Python definition. Gate optional nodes with `Features`; do not assume a local Self-Start installation represents remote backends.
4. Create nodes through `CreateNode`. Preserve the reserved IDs documented in `WorkflowGeneratorSteps.cs`; let ordinary nodes use dynamic IDs. Be aware that generic `CreateNode` calls may deduplicate identical class/input pairs.
5. Route the result back through `WGNodeData` or the appropriate current field. Preserve compatibility and media metadata deliberately.
6. Check no-op/default behavior, base and refiner stages, image/video/audio forms as applicable, optional-node absence, `RestrictCustomNodes`, and final cleanup. If graph rewriting adds or removes connections, account for the cached `UsedInputs`.
7. Review the generated workflow shape and pending diff. Follow the repository build/test policy in `AGENTS.md`.

Keep edits narrow and match the surrounding C# style: explicit types, full braced blocks, XML documentation for fields, and existing utility functions.
