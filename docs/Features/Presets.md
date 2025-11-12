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

## Linking Stable Diffusion or LoRA Models to a Preset

It's common for models to have specific recommended values for CFG scale, steps, resolution, sampler, etc. Or, you may just have your own preferences for getting the "look" you want from them.

To do this, create a preset with your preferred settings. Then, go to the *Edit Metadata* dialog for the model and pick the preset from the dropdown and save. After that, any time you select that model, the linked preset is also selected and can be applied.

Some nuances of this feature:

1. Presets linked to *Stable Diffusion models* are considered *mutually exclusive* to one another. So, if you select a model, its preset is selected, and if you click another model that has its own preset, the first model's preset is unselected and the new model's preset is selected. This avoids accidentally "stacking" incompatible presets for different models. (LoRA presets don't work this way -- they are just selected with the LoRA and are *not* automatically de-selected if you disable the LoRA.)

2. You *can* have a single Preset linked to multiple models, but you can only link one preset at a time to each model.

3. These links are *user-level* setting, not global.
