# Presets

(TODO: Info about how presets work and all that)

Presets allow you to save and reuse sets of generation parameters across different workflows. When you create a new preset, you choose the parameters to be applied by that preset when you select it later. You can choose multiple presets, they "overlay" their settings.

When you have presets selected, the parameters they include are locked from editing until you either unselect the presets or "apply" them to your prompt.

# Official SDXL Preset Pack

These are the presets that were used on DreamStudio (Stability AI's web generation platform) around the time that SDXL was launched to the public in 2023.

- Download this file: [SDXL Official Presets.json](https://github.com/mcmonkeyprojects/SwarmUI/releases/download/0.6.5-Beta/SDXL.Official.Presets.json) and save it somewhere (anywhere, desktop is fine)
- Open SwarmUI and open the `Presets` tab at the bottom
- Click on the `Import Presets` button
- drag the presets file in to the box that appears
- Click the `Import` button at the bottom
- close the box, look at your presets list - there is now a folder labeled `sdxlofficial` on the side. Click into that.

![img](/docs/images/presets.png)

- You can click on any preset to use it, or unclick it to disable it.
    - (Note: if it behaves weird, refresh the page. Alpha projects do silly things sometimes!)

## Linking Models and LoRA to a Preset

It's common for models and LoRA to have specific recommended values for CFG scale, steps, resolution, sampler, etc. Or, you may just have your own preferences for getting the "look" you want from them.

To do this, create a preset with your preferred settings. Then, go to the *Edit Metadata* dialog for the model or LoRA and pick the preset from the dropdown and save. After that, any time you select that model or LoRA, the linked preset is also selected and can be applied.

Some nuances of this feature:

1. Presets linked to *models* are considered *mutually exclusive* to one another. So, if you select a model, its preset is selected, and if you click another model that has its own preset, the first model's preset is unselected and the new model's preset is selected. This avoids accidentally "stacking" incompatible presets for different models. (LoRA presets don't work this way -- they are just selected with the LoRA and are *not* automatically de-selected if you disable the LoRA.)

2. You *can* have a single Preset linked to multiple models or LoRA, but you can only link one preset at a time to each model or LoRA.

3. These links are *user-level* setting, not global.

4. If a model's linked preset specifies that a given LoRA be included at a certain weight, and that LoRA *also* has a preset, that preset will also be selected. (This only nests one level -- LoRA presets can load other LoRA, but it won't select those other LoRAs' presets.)

5. If you enable the User Setting `AutoApplyModelPresets`, rather than *selecting* the appropriate preset for the model and downstream LoRA, it will immediately *apply* those settings. This is very convenient if you just want to flip between models and have your preferred weights, steps, CFG scale, etc. be set instantly.

6. If you enable the User Setting `IgnoreNestedZeroWeightLoraPresets`, the logic in (3) above is slightly adjusted, so any LoRA in the model's preset that has a weight of `0` will *not* have its own preset loaded. The reasoning for this option is as follows:

  - There are many situations where a LoRA is on the same platform as a model, but is incompatible with the model. For example, you shouldn't use an LCM LoRA with a model that already has LCM or DMD "built in."
  - When flipping between models, it can be a chore to remember to add or remove these "process" LoRA that apply to some models but not others.
  - Presets don't support allowing you to *remove* a LoRA.
  - However, you *can add* a LoRA with a weight of `0`. The LoRA still takes up VRAM, but has no impact on the generation.
  - So, if you keep accidentally leaving an LCM model active when you switch to a DMD model, you can set the DMD model's preset to "include" the LCM model, but with a weight of `0`.
  - It's also likely you'd want to set a preset for the LCM LoRA, because when you *normally* add it, you want to override the usual step count, etc.
  - But in this situation with the DMD model, you want the LCM LoRA to be effectively disabled *and* you wouldn't want its preset to override your DMD model's preset.
  - If this is not a situation you regularly have to deal with, you can leave this option disabled; it's primarily for users who have lower-end devices who prefer to stick with low-step configurations regardless which model they are using.
