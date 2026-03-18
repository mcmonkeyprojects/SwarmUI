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
- `ImageEditorToolWithColor` - Extends base. Adds color control support: `getColorControlsHTML()`, `wireColorControls()`, `setColor(col)`, and color-aware `onLayerChanged()` with dual mask/image color memory. Tools that need a color picker (Brush, Bucket, Shape) extend this.
- `ImageEditorToolSam2Base` - Extends base. Shared SAM2 warmup/clear-mask/request-tracking logic. Subclasses override `addWarmupGenData(genData, cx, cy)` and optionally `onClearMask()`. SAM2Points and SAM2BBox extend this.
- Concrete tools extend the appropriate base: `ImageEditorToolBrush`/`ImageEditorToolBucket`/`ImageEditorToolShape` extend `ImageEditorToolWithColor`; `ImageEditorToolSam2Points`/`ImageEditorToolSam2BBox` extend `ImageEditorToolSam2Base`; others extend `ImageEditorTool`.

### Tool Registration

Tools are registered in the `ImageEditor` constructor via `this.addTool(new ToolClass(...))`. Order matters for toolbar display. The tool ID string (e.g., `'brush'`, `'paintbucket'`) is used with `this.editor.activateTool(id)`.

### Layer System

- Layers have a boolean `isMask` property.
- `onLayerChanged(oldLayer, newLayer)` is called on every tool when the active layer changes (via `setActiveLayer()`). The old layer is passed directly so tools can compare previous vs new state.
- The base `onLayerChanged` handles `isMaskOnly` tools (hides them when not on a mask).
- Tools with color can override `onLayerChanged` to adapt (e.g., compress color to grayscale for masks, swap stored color based on `oldLayer.isMask` vs `newLayer.isMask`).

### Color Controls Pattern

Tools that use color extend `ImageEditorToolWithColor`, which provides:

1. **`getColorControlsHTML()`**: Returns HTML for a `.image-editor-tool-block` div with hex text input (`.id-col1`), color swatch (`.id-col2`), and eyedrop button (`.id-col3`). Uses `this.color` for the default value.
2. **`wireColorControls()`**: Call after setting `configDiv.innerHTML` to wire up the color picker, swatch click, and eyedropper button. Opens the picker via the singleton `colorPickerHelper` (from `color_picker.js`).
3. **`setColor(col)`**: Updates `this.color`, the text input, and the swatch background.
4. **Dual color memory**: `imageColor` and `maskColor` fields store separate colors for image vs mask layers. The inherited `onLayerChanged` swaps between them (guarded by `this.colorText` existing, so tools like the eraser that skip `wireColorControls()` are unaffected).
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
- If adding color controls, extend `ImageEditorToolWithColor`, pass the default color to `super()`, call `this.getColorControlsHTML()` when building config HTML, and call `this.wireColorControls()` after setting `configDiv.innerHTML`. The base class handles `setColor()`, `onLayerChanged()` color swapping, and grayscale enforcement automatically.
