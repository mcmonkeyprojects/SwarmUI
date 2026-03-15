---
name: image-editor-tools
description: Architecture and patterns for developing image editor tools and UI in the SwarmUI image editor.
---

# Image Editor Tools

Guide to the image editor tool system in `src/wwwroot/js/genpage/helpers/image_editor.js`.

## When to Use

- Use this skill when adding or modifying image editor tools
- Use this skill when working with layers, color controls, or the image editor toolbar
- Use this skill when adding new helper JS files that interact with the image editor

## Architecture

### Class Hierarchy

- `ImageEditorTool` - Base class. Creates `this.div` (toolbar button) and `this.configDiv` (bottom bar config area) via `makeDivs()`. Has lifecycle methods: `setActive()`, `setInactive()`, `draw()`, mouse handlers, `onLayerChanged()`.
- `ImageEditorTempTool` - Extends base. Overrides `makeDivs()` with a no-op, so `this.div` is **undefined**. Used for hidden sub-tools (e.g., the eyedropper color picker tool). Any code accessing `.div` on a tool must null-check for this case.
- Concrete tools (e.g., `ImageEditorToolBrush`, `ImageEditorToolBucket`, `ImageEditorToolShape`) extend `ImageEditorTool`.

### Tool Registration

Tools are registered in the `ImageEditor` constructor via `this.addTool(new ToolClass(...))`. Order matters for toolbar display. The tool ID string (e.g., `'brush'`, `'paintbucket'`) is used with `this.editor.activateTool(id)`.

### Layer System

- Layers have a boolean `isMask` property.
- `onLayerChanged(oldLayer, newLayer)` is called on every tool when the active layer changes (via `setActiveLayer()`). The old layer is passed directly so tools can compare previous vs new state.
- The base `onLayerChanged` handles `isMaskOnly` tools (hides them when not on a mask).
- Tools with color can override `onLayerChanged` to adapt (e.g., compress color to grayscale for masks, swap stored color based on `oldLayer.isMask` vs `newLayer.isMask`).

### Color Controls Pattern

Tools that use color (Brush, Bucket, Shape) share a common pattern:

1. **HTML**: A `.image-editor-tool-block` div containing a hex text input (`.id-col1`), a color swatch (`.id-col2`), and an eyedrop button (`.id-col3`).
2. **Color picker**: Opened via `colorPickerHelper.open(anchor, color, onChange, grayscale)`. The singleton `colorPickerHelper` (from `color_picker.js`) handles all color selection UI.
3. **`setColor(col)`**: Updates `this.color`, the text input, and the swatch background.
4. **Dual color memory**: `imageColor` and `maskColor` fields store separate colors for image vs mask layers. `onLayerChanged` swaps between them.
5. **Grayscale enforcement**: When on a mask layer, colors are compressed to grayscale via `colorPickerHelper.hexToGrayscale()`, and the picker opens in grayscale mode.

### Bottom Bar Config

Each tool's config UI is in `this.configDiv`, a flex row at the bottom of the editor. Common sub-blocks use `.image-editor-tool-block` with `align-items: center`. Sliders use `enableSliderForBox()` from `site.js`.

## Instructions

- When adding a new tool, extend `ImageEditorTool` (or `ImageEditorTempTool` if it should be hidden).
- Register it in the `ImageEditor` constructor with `this.addTool(new YourTool(this))`.
- If the tool needs a new helper JS file, add it to `src/Pages/Text2Image.cshtml` in the `@section Scripts` block **before** `image_editor.js`.
- Use `createDiv()` from `util.js` for DOM creation.
- Use theme CSS variables (`--popup-back`, `--light-border`, etc.) for styling.
- Always null-check `.div` when working with tools that might be TempTools.
- If adding color controls, follow the existing Brush/Bucket/Shape pattern with `colorPickerHelper` integration, dual color memory, and grayscale support.
