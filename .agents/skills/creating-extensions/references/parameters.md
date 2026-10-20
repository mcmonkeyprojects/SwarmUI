# Extension Parameters and Groups

## Source References

- `src/Text2Image/T2IParamTypes.cs`: `T2IParamGroup`, `T2IParamType`, `Register<T>`, validation, and ID cleaning.
- `src/Text2Image/T2IParamInput.cs` and `T2IParamSet.cs`: presence, defaults, feature requirements, and query tracking.
- `src/BuiltinExtensions/DynamicThresholding/DynamicThresholdingExtension.cs`: complete extension-owned group and node-backed parameters.
- `src/wwwroot/js/genpage/gentab/params.js`: generated controls, group toggles, and request construction.

## Register in the Extension

Declare typed parameter handles and the group on the extension class, then assign them in `OnInit()`. Do not put extension parameters in `T2IParamTypes.RegisterDefaults()` or `ComfyUIBackendExtension.OnInit()`.

Every extension's generation controls must have their own distinctly named group with `Toggles: true`. Use additional extension-owned toggleable groups when there are separate features. Do not insert controls into a core group. `Open: false` collapses a group; it does not make the feature opt-in. `IsAdvanced: true` is suitable for specialist features, not a requirement for every extension.

For example, these fields and registrations belong in the extension class and its `OnInit()` respectively:

```cs
/// <summary>Controls for the extension's blur feature.</summary>
public static T2IParamGroup BlurGroup;

/// <summary>Blur radius supplied to the workflow.</summary>
public static T2IRegisteredParam<int> BlurRadius;

/// <summary>Gaussian sigma supplied to the workflow.</summary>
public static T2IRegisteredParam<double> BlurSigma;
```

```cs
BlurGroup = new("My Extension Blur", Toggles: true, Open: false);
BlurRadius = T2IParamTypes.Register<int>(new("[MYEXT] Blur Radius", "", "1", Min: 1, Max: 31, Step: 1, Group: BlurGroup, FeatureFlag: "comfyui", OrderPriority: 1));
BlurSigma = T2IParamTypes.Register<double>(new("[MYEXT] Blur Sigma", "", "1", Min: 0.1, Max: 10, Step: 0.1, Group: BlurGroup, FeatureFlag: "comfyui", OrderPriority: 2));
```

This example matches `ImageBlur` in the locally installed upstream source. Verify the contract again before using it. Leave parameter `Description` strings blank for the human operator to fill in, and tell them which descriptions remain to be written.

## Names, Types, and Defaults

- Parameter IDs are global. `CleanTypeName` lowercases the name and retains only ASCII letters `a` through `z`; punctuation, spaces, and digits disappear. A distinctive prefix such as `[MYEXT]` prevents collisions. Group IDs use the same transformation. Keep names stable because presets, metadata, API inputs, and frontend hooks use these IDs.
- `Register<T>` infers storage and UI types. Use the actual supported type, such as `int`, `double`, `bool`, `string`, or `T2IModel`; do not set `Type`, `SharpType`, or `ID` yourself. A string with `GetValues` becomes a dropdown.
- Defaults are strings parsed into the registered type. Every numeric parameter needs meaningful `Min`, `Max`, and `Step`; derive bounds from the node contract and supported semantics. `ViewMin`/`ViewMax` can narrow the visible slider range without narrowing accepted values.
- `GetValues` must return actual accepted backend values. `value///Display Name` separates storage from presentation. Keep value validation enabled. Model selectors need the right subtype and session-filtered model names.
- Set `FeatureFlag: "comfyui"` for general Comfy behavior, or a discovered node-pack feature ID for optional nodes. Comma-separated flags require all listed capabilities. Read [node packs](node-packs.md) before introducing a pack-specific flag.
- `Toggleable: true` on an individual parameter is useful when that control has its own optional meaning within the enabled group. It is separate from the group's `Toggles: true`.
- `IgnoreIf` removes a value matching its no-op representation. Do not put it on the only parameter used to detect group activation when that value should still activate the feature.
- Use `DependNonDefault: Controller.Type.ID` for a subordinate control whose visibility depends on another parameter being enabled/non-default. Keep `OrderPriority` local to the group's controls.
- Normal registered controls already participate in UI construction, presets, metadata, and API input parsing. Do not add custom JavaScript controls or a new API route for an ordinary parameter. Use unusual flags such as `DoNotPreview`, `AlwaysRetain`, or `CanSectionalize` only after tracing their consumers.

## Presence Is the Activation Contract

The generated frontend omits disabled group members from the generation request. There is no automatic server-side group-enabled boolean. Start the workflow callback with `g.UserInput.TryGet(ActivationParam, out ...)`, choosing a group member that is neither individually toggleable nor ignored at its normal default. If it is absent, do nothing.

Once the group is active, read companion parameters with explicit fallbacks matching their registered defaults. API callers can submit an incomplete group, so do not assume every companion is present.

`Get(param)` can return the registered default even when the parameter was absent. It is therefore inappropriate as the sole activation check. `Get(param, fallback)` supplies the explicit fallback on absence. `TryGet` distinguishes absent from present. These accessors also record parameter usage for metadata/pruning; read the registered handles instead of parsing request JSON inside the workflow.

If renaming an existing parameter is requested, inspect `T2IParamTypes.ParameterRemaps` and register the old-to-new ID mapping from the extension. Preserve presets and old metadata without registering both names.

## Verify

Trace one handle from registration through request presence to its workflow consumer. Check disabled group, enabled group with defaults, optional controls, partial API input, invalid bounds/options, feature absence, and preset/metadata reuse. With the group off, the extension must not add its generation behavior.
