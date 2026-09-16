---
name: t2i-parameter-handling
description: Add or modify SwarmUI text-to-image generation parameters, including their registration, UI behavior, validation, metadata, feature gating, and ComfyUI workflow consumption.
---

# T2I Parameter Handling

## When to Use

- Use when you are adding a new text-to-image (text2image, t2i) parameter, or editing an existing parameter.
- Only ever add a new parameter if a user has directly instructed you to. If you think one is needed or helpful and they haven't instructed you to, explain your idea and ask the user if it's okay.

## Relevant Paths

- `src/Text2Image/T2IParamTypes.cs`: parameter schema, core declarations, groups, registration, validation, and compatibility remaps.
- `src/Text2Image/T2IParamSet.cs` and `T2IParamInput.cs`: typed storage, `Get`/`TryGet`/`Set`, feature requirements, queried-parameter tracking, and metadata.
- `src/BuiltinExtensions/ComfyUIBackend/ComfyUIBackendExtension.cs`: Comfy-specific declarations and registration in `OnInit`; dynamic dropdown values and backend feature discovery also live here.
- `src/BuiltinExtensions/ComfyUIBackend/WorkflowGenerator.cs`, `WorkflowGeneratorSteps.cs`, `WorkflowGeneratorModelSupport.cs`, and `WGNodeData.cs`: consume parameters and translate them into Comfy nodes.
- `src/WebAPI/T2IAPI.cs` (`ListT2IParams`) and `src/wwwroot/js/genpage/gentab/params.js`: server-to-UI serialization and generic control rendering; inspect these only for unusual UI behavior.
- `docs/Making Extensions.md`: small extension parameter example.

## Add or Edit a Parameter

1. Put a broadly applicable parameter in `T2IParamTypes`: add its typed static field and assign it with `Register<T>(...)` in `RegisterDefaults()`. Put a Comfy-only parameter in `ComfyUIBackendExtension`: declare it there and register it in `OnInit()`.
2. Consume the registered handle in the relevant generation path. Prefer `TryGet(param, out value)` when the behavior should run only when explicitly enabled/present; use `Get(param, fallback)` when the workflow always needs a value. Keep that fallback consistent with the registered default.
3. If a backend capability is required, assign the correct `FeatureFlag` and ensure the backend actually advertises it. Comma-separated flags are all required.
4. If renaming or replacing a parameter, preserve old presets/metadata/API input with a one-way entry in `T2IParamTypes.ParameterRemaps`; do not keep the old parameter registered.
5. Search by both field name and generated ID to check declarations, registration, consumers, defaults, and special UI/backend logic. The ID is the lowercase parameter name with non-lowercase letters removed, via `CleanTypeName`.

## Choose Registration Values

- `T` controls storage, validation, and UI type: use `string`, `int`/`long`, `double`, `bool`, `T2IModel`, `Image`/`AudioFile`/`VideoFile`, or the supported list forms. Do not set `Type` or `SharpType`; `Register<T>` infers them. A `string` with `GetValues` becomes a dropdown.
- `Name`: use a stable and clear user-facing name, ideally one given to you by the user, and ensure it matches the field name.
- `Description`: leave blank. An agent should never write this, the human operator will fill it in. Remind the user to do this and tell them any info or context that may help them write it correctly.
- `Default`: Encode the default as a string accepted by the selected type. Prefer a safe, ordinary default.
- `Min`, `Max`, `Step`: set real validation bounds for every numeric parameter. Use `ViewMin`/`ViewMax` to keep a slider practical while still allowing a wider typed range. Choose `ViewType` from `SMALL`, `BIG`, `SLIDER`, `POT_SLIDER`, `SEED`, or `VIDEO_FRAMES` to match the interaction.
- `GetValues`: return valid stored values. Use `value///Display Name` when the backend value and label differ. Values are validated by default; use `ValidateValues: false` only if invalid data is specifically desired for some strange reason. For model parameters, set the correct `Subtype` and always return session-filtered models.
- `Group` and `OrderPriority`: place the control beside related parameters and order it locally. Create a new `T2IParamGroup` only for a coherent feature set. Use `IsAdvanced` for specialist controls and `VisibleNormally: false` for controls handled by custom UI or internal code.
- `Toggleable`: use when absence is meaningfully different from supplying the displayed default - alternately, `IgnoreIf` removes the parameter when its value is a no-op or a clear default (commonly `"false"`, `"0"`, `"1"`, `"None"`, or `""`). Use `DependNonDefault: OtherParam.Type.ID` only for a subordinate control that should appear after its controller is enabled/non-default.
- `FeatureFlag`: gate parameters that only some backends/models can implement (`"comfyui"` for general Comfy-only behavior, or a narrower discovered feature). Add `Permission` for protected model, video, backend, or extension capabilities.
- `Examples`: Add examples of common or simple good inputs
- `Clean` and `ParseList`: use cleaners only for real normalization or edit semantics.
- Rare flags should follow nearby precedent: `DoNotPreview` for expensive or output-changing stages, `CanSectionalize` only when consumers read section IDs, `HideFromMetadata`/`DoNotSave` for sensitive or transient internals, `AlwaysRetain` for values needed despite workflow pruning, `IntentionalUnused` for values handled outside normal query tracking, and `ChangeWeight` for grid ordering based on recomputation cost.

## Verify

- Confirm the same registered handle is read by the implementation and that optional/no-op values do not alter unrelated generations.
- Check the generated control, feature visibility, toggle/dependency behavior, invalid bounds/options, preset reuse, metadata, and a representative Comfy workflow.
- Review `git diff` and keep parameter-only changes focused; do not hand-code frontend controls unless the generic renderer cannot express the required behavior.
