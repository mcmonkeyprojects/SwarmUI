# Presets

Presets allow you to save and reuse combinations of generation parameters. You can create, edit, duplicate, and organize presets in the Presets tab.

To create a preset:
- Set your desired parameters in the main UI.
- Go to the Presets tab and click "Create New Preset".
- Fill in the name and select which parameters to include.
- Optionally, add a description and/or preview image.

Presets can be organized into folders by using `/` in the name (e.g., `folder/my-preset`).

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

## Starring Presets

You can star your favorite presets to mark them as important. Starred presets are visually indicated with a glowing effect on their preview image.

- To star or unstar a preset, click the "Star" or "Unstar" button in the preset's menu (accessible by the menu button on the preset card).
- Starred presets will appear first in the list when sorting by "Starred".

## Sorting Presets

The presets list can be sorted in different ways using the dropdown next to the preset list:

- **Default**: Presets appear in their original order.
- **Name**: Sorts presets alphabetically by their filename (the part after the last `/` in the path).
- **Path**: Sorts presets alphabetically by their full path.
- **Starred**: Sorts starred presets first (alphabetically by name), followed by unstarred presets (also alphabetically by name).

You can also check the "Reverse" checkbox to reverse the sort order.
