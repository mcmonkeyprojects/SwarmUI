# Custom Comfy Node Packs

## Source References

- `src/Core/InstallableFeatures.cs`: installable feature records and registry.
- `src/BuiltinExtensions/DynamicThresholding/DynamicThresholdingExtension.cs` and `assets/dyn_thresh.js`: complete registration/button pattern.
- `src/BuiltinExtensions/ComfyUIBackend/ComfyUIBackendExtension.cs`: `NodeToFeatureMap` and `AssignValuesFromRaw`.
- `src/wwwroot/js/genpage/gentab/params.js`: `addInstallButton`.
- `src/wwwroot/js/genpage/main.js`: `installFeatureById` and installer UI.
- `src/BuiltinExtensions/ComfyUIBackend/ComfyUIWebAPI.cs`: `ComfyInstallFeatures`.
- `src/BuiltinExtensions/ComfyUIBackend/ComfyUISelfStartBackend.cs`: `EnsureNodeRepo`, managed-node updates, and `CustomNodePaths`.

## Inspect the Pack Before Integrating It

Prefer an existing generator helper or available Swarm/core Comfy node. If a third-party pack is necessary, identify its actual repository and read its node definitions using [the workflow source-inspection procedure](workflows.md#inspect-the-python-contract-first). Use `DLNodes/<repository-name>/` when it is already installed. A pack's README and screenshots are not a substitute for its API contract.

If the pack is absent, read the matching upstream source remotely or obtain a source checkout within the user's permissions. Do not trigger a live install merely to read Python. Check the supported Comfy version, Python requirements, required models, extra setup, and licensing information needed for the README. Inspect actual execution behavior, including any downloads performed by the node itself.

For a real legacy-node example, `DLNodes/sd-dynamic-thresholding/__init__.py` maps `DynamicThresholdingFull` to `DynamicThresholdingComfyNode` in `dynthres_comfyui.py`. Its `separate_feature_channels` input accepts `"enable"`/`"disable"`, not a JSON boolean, and its patched `MODEL` is output `0`. Trace the mapped class and implementation even when the pack's name sounds sufficient to infer its behavior.

## Register Installation and Discovery Separately

In the extension's `OnInit()`:

1. Register `InstallableFeatures.RegisterInstallableFeature(new(...))` with display name, stable lowercase ID, root repository URL, and author. Use an HTTPS clone URL without a trailing slash or `.git` suffix, matching the registry's existing examples.
2. Register the exact node ID in `ComfyUIBackendExtension.NodeToFeatureMap` with an appropriate feature ID. Presence in `object_info` drives discovery. Installation registration alone does not advertise the node's capability.
3. Register the extension's own toggleable parameter group and gate its node-dependent parameters with that discovered feature ID.
4. Add a small extension-owned script to `ScriptFiles`, and call `addInstallButton(groupId, featureId, installId, buttonText)` in that script.
5. In the workflow callback, check parameter presence, check `g.Features`, emit the verified inputs, and route the output into the correct generator state.

The installer ID and discovered feature ID can differ. The first selects a repository from `InstallableFeatures.ComfyFeatures`; the second describes node capability. Keep them the same for a simple one-pack feature unless an existing registration already supplies the dependency. Do not overwrite an existing node-to-feature mapping with an unrelated ID.

The built-in Dynamic Thresholding example registers:

```cs
InstallableFeatures.RegisterInstallableFeature(new("Dynamic Thresholding", "dynamic_thresholding", "https://github.com/mcmonkeyprojects/sd-dynamic-thresholding", "mcmonkey"));
ComfyUIBackendExtension.NodeToFeatureMap["DynamicThresholdingFull"] = "dynamic_thresholding";
ScriptFiles.Add("assets/dyn_thresh.js");
```

Its group is named `Dynamic Thresholding`, so its cleaned group ID is `dynamicthresholding`. Its corresponding script call is:

```js
addInstallButton('dynamicthresholding', 'dynamic_thresholding', 'dynamic_thresholding', 'Install Dynamic Thresholding');
```

These are existing registrations to study, not IDs for a new extension to register again. Substitute the new pack's verified details. Compute the button's `groupId` from the group name using `CleanTypeName` rules, not from its parameter prefix or C# field name. The helper registers deferred callbacks itself; it places the button after controls are built and removes it when the feature is available. Its `keep_group_visible` wrapper permits installation when the group's feature-gated controls are hidden.

`Notice` is optional: the registry supplies a confirmation message identifying the repository and author. Supply a custom notice when necessary to explain pack-specific consequences. `AutoInstall` defaults to false; leave the normal button-driven installation in place unless automatic installation is part of the requested feature. `SkipPipCache` is an exceptional installation option, not a normal default.

## What the Existing Installer Handles

The integration path is:

1. The page exposes registered installable-feature metadata to the browser.
2. `addInstallButton` calls `installFeatureById`, which displays the notice and sends the selected installer ID to the existing `ComfyInstallFeatures` route.
3. That route requires `Permissions.InstallFeatures` and a running ComfyUI Self-Start backend, resolves the registered URL, and invokes `EnsureNodeRepo`.
4. The managed checkout lands at `src/BuiltinExtensions/ComfyUIBackend/DLNodes/<repository-name>/`. This directory is separate from the Swarm extension under `src/Extensions/`.
5. For a newly cloned pack with `requirements.txt`, the installer handles Python requirements through the Self-Start environment and backend shutdown/reinitialization. The route handles the necessary restart path. Do not duplicate this with a shell script or a new API route.
6. After backend initialization, node discovery supplies the feature flag. Verify that the node actually loaded, rather than equating an installation response or folder existence with a working feature.

Self-Start includes `DLNodes` and Swarm's `ExtraNodes` in Comfy's custom-node search paths. Do not copy or symlink a downloaded pack into an arbitrary `dlbackend/.../custom_nodes` directory. Managed-node updates follow Self-Start's update settings; installing a pack is not a guarantee that every later update or dependency change is handled without intervention.

The install route does not remotely provision an independently managed Comfy API backend. Document how its operator installs the pack into that Comfy environment and restarts it. Never assume a local `DLNodes` checkout configures an external server.

## Extension-Owned Python

If the feature requires new Python nodes rather than an existing pack, keep them in the extension repository. `ComfyUISelfStartBackend.CustomNodePaths` is a registration hook for additional node search roots. In `OnInit()`, add the path to a directory containing the extension's Comfy node package(s), using `FilePath` and an absolute path as appropriate. Each package must expose the node registration supported by the installed Comfy version.

Do not put extension-owned Python in the core `ExtraNodes` directory or modify downloaded packs. `CustomNodePaths` adds search locations; it does not install Python dependencies or deploy files to external Comfy servers. Plan those requirements explicitly and document them. Recheck the node contract and discovery after the backend restarts.

## Verify

Check the three linked identifiers: cleaned group ID, discovered feature ID, and installer ID. Confirm the absent-pack case exposes the button, the request uses the existing permissioned route, successful node loading hides the button and reveals usable controls, and generated nodes match the installed source. Give the user manual checks for installation failures and externally managed backends when those paths are relevant.
