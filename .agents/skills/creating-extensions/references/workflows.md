# Comfy Workflow Integration

## Source References

- `src/BuiltinExtensions/ComfyUIBackend/WorkflowGenerator.cs`: `AddStep`, `AddModelGenStep`, generator state, `CreateNode`, and `Generate`.
- `src/BuiltinExtensions/ComfyUIBackend/WorkflowGeneratorSteps.cs`: actual core ordering and reserved node IDs.
- `src/BuiltinExtensions/ComfyUIBackend/WorkflowGeneratorModelSupport.cs`: model loading and model-hook invocation.
- `src/BuiltinExtensions/ComfyUIBackend/WGNodeData.cs`: typed paths, conversions, metadata, and output saving.
- `src/BuiltinExtensions/DynamicThresholding/DynamicThresholdingExtension.cs`: an external-node parameter group and model-patching step.
- `src/BuiltinExtensions/ComfyUIBackend/ComfyUIAPIAbstractBackend.cs`: normal generation versus stored/raw custom workflows.

## Inspect the Python Contract First

Do not infer Comfy input names or output indexes from a node's display name, a screenshot, or a frontend workflow's widget ordering. Swarm emits Comfy **API-format** workflows, not canvas-layout JSON.

1. Search existing generator helpers and `WGNodeData` for the behavior first. Reuse loading, conversion, sampling, and saving helpers rather than rebuilding their node sequences.
2. Locate the Comfy source under `dlbackend/`. The directory varies by installation: for example, `dlbackend/comfy/ComfyUI/nodes.py`, not necessarily `dlbackend/comfy/nodes.py`. Find the checkout containing `nodes.py` and `comfy_extras/`; avoid searching bundled Python libraries as if they were node sources.
3. Search Swarm's `src/BuiltinExtensions/ComfyUIBackend/ExtraNodes/`, upstream `nodes.py` and `comfy_extras/`, and, when needed, `src/BuiltinExtensions/ComfyUIBackend/DLNodes/`. Search exact node IDs if known, otherwise behavior synonyms, data types, categories, aliases, and display names.
4. For legacy nodes, trace the exact `NODE_CLASS_MAPPINGS` key to its class, then read `INPUT_TYPES`, `RETURN_TYPES`, `FUNCTION`, and the implementation. For schema-based nodes, read `define_schema()`: `node_id` is the API `class_type`; inputs and ordered outputs define the contract. Confirm the class is actually returned through `get_node_list()` and `comfy_entrypoint()`.
5. Record required and optional input names, connection types, scalar types, enum values, bounds, defaults, output indexes, and any hidden inputs or output-node behavior. Read the execution function for semantics: model patches, latent compatibility, masks, batch handling, downloads, and side effects matter beyond the schema.
6. If using an already running backend's `object_info`, compare it with the source for the installed node version. If source is unavailable, obtain the matching upstream source before implementing the contract; do not guess. Reading source does not require executing it or installing its dependencies.

All downloaded code under `dlbackend/` and `DLNodes/` is reference-only. Do not patch it to make an extension work. For optional packs and extension-owned Python, follow [node packs](node-packs.md).

As a concrete source check, `ImageBlur` is currently a schema-based `Blur` class in upstream `comfy_extras/nodes_post_processing.py`. Its API inputs are `image`, `blur_radius` (integer 1–31), and `sigma` (float 0.1–10); its image output is index `0`. The C# extension must use `ImageBlur`, not `Blur` or its display name. Recheck the installed version before copying this example.

## Choose and Register the Hook

Register hooks in the extension's `OnInit()`; leave core generator files untouched.

| Hook | Use it for | State to update |
| --- | --- | --- |
| `WorkflowGenerator.AddStep(callback, priority)` | A stage in normal generated workflows, such as patching the active model before sampling or processing media before saving. | `CurrentModel`, `CurrentTextEnc`, `CurrentVae`, `CurrentMedia`, or conditioning fields, as appropriate. |
| `WorkflowGenerator.AddModelGenStep(callback, priority)` | Logic that must participate in individual model loading, including supported base/refiner/other stages. | `LoadingModel`, `LoadingClip`, and/or `LoadingVAE` paths. |

Both lists run in ascending priority, but they are separate timelines. Read the actual neighboring registrations to choose a priority. Do not use old overview comments as the priority map. Currently the main model load is at `-15`, the true final save at `100`, and cleanup at `200` in the normal step list. An old example running at `9` is not immediately before the true final save.

Model hooks with priority `<= -100` run before the built-in loader; a custom loader must supply the appropriate `Loading*` outputs. Hooks with priority `> -100` run after loading. Check `LoadingModelType`, `IsRefinerStage`, other relevant stage flags, and parameter section IDs. A model hook may run for multiple model loads, while loader reuse can avoid running it again. Do not treat it as a once-per-request callback or update `CurrentModel` when the loader is consuming `LoadingModel`.

Keep per-generation data in the supplied generator and local variables. Static registrations/handles must not hold the active request's model or media.

## Build and Connect the Graph

`g.CreateNode("ExactNodeID", inputs)` creates a node and returns its ID. Connections are `[node ID, output index]`, built with `WorkflowGenerator.NodePath(id, index)` or a `JArray` collection expression. Inputs must match the verified Python contract, including enum strings that may resemble booleans. Let ordinary nodes receive dynamic IDs; do not take a reserved ID from core.

Most current passthrough fields are `WGNodeData`. Pass `.Path` into node inputs, then replace the relevant field with `.WithPath(newPath)` when the result preserves its representation and metadata. Creating a disconnected node does not apply an effect. Avoid obsolete aliases such as `FinalImageOut`, `FinalModel`, and `FinalSamples` in new extension code.

For media, use `AsRawImage`, `AsLatentImage`, `AsSamplingLatent`, `EncodeToLatent`, and `DecodeLatents` as appropriate. If an operation changes representation, dimensions, frame count, FPS, alpha, or attached audio, update that metadata deliberately; `WithPath` alone preserves it. Do not replace normal saving with a new output node just to insert an image filter.

For the parameters in [parameters](parameters.md), this callback processes still images before the true final save:

```cs
WorkflowGenerator.AddStep(g =>
{
    if (!g.UserInput.TryGet(BlurRadius, out int radius) || g.UserInput.Get(T2IParamTypes.JustLoadModel, false))
    {
        return;
    }
    if (g.CurrentMedia.DataType != WGNodeData.DT_IMAGE && g.CurrentMedia.DataType != WGNodeData.DT_LATENT_IMAGE)
    {
        throw new SwarmUserErrorException("My Extension Blur requires a still image.");
    }
    WGNodeData image = g.CurrentMedia.AsRawImage(g.CurrentVae);
    string blurred = g.CreateNode("ImageBlur", new JObject()
    {
        ["image"] = image.Path,
        ["blur_radius"] = radius,
        ["sigma"] = g.UserInput.Get(BlurSigma, 1.0)
    });
    g.CurrentMedia = image.WithPath([blurred, 0]);
}, 99);
```

This requires `SwarmUI.Builtin_ComfyUIBackend`, `SwarmUI.Text2Image`, `SwarmUI.Utils`, and `Newtonsoft.Json.Linq`. The priority and still-image restriction are choices for this example, not defaults for all extensions. For a model patch, follow Dynamic Thresholding's pattern of reading `g.CurrentModel.Path` and assigning `g.CurrentModel.WithPath(...)`; use a model-generation hook instead when it must follow each supported model load.

Before emitting an optional third-party node, check its discovered ID in `g.Features` and report an unavailable requested feature with `SwarmUserErrorException`. Do not add a feature directly to the supported-feature set just because its repository is present. Follow the existing `RestrictCustomNodes` handling when selecting between custom and core implementations; do not bypass restrictions.

## Verify the Behavior

- Trace group activation, parameter reads, exact node inputs, output indexes, and the updated passthrough to the eventual sampler/save.
- Check the disabled case adds no feature behavior and that missing optional nodes produce a useful error.
- Account for the relevant base/refiner stages and supported image/video/audio types. Do not silently apply an image-only node to unrelated media.
- Review a generated API-format graph with the user when live verification is needed. A normal workflow hook does not automatically rewrite user-supplied stored/raw custom workflows; check `CreateWorkflow` before promising that behavior.
- Prefer a correctly placed hook over scanning and patching the finished graph.
