
/**
 * A single layer within an image editing interface.
 * This can be real (user-controlled) OR sub-layers (sometimes user-controlled) OR temporary buffers.
 */
class ImageEditorLayer {
    constructor(editor, width, height, parent = null) {
        this.editor = editor;
        this.parent = parent;
        this.canvas = document.createElement('canvas');
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        this.offsetX = 0;
        this.offsetY = 0;
        this.rotation = 0;
        this.opacity = 1;
        this.globalCompositeOperation = 'source-over';
        this.childLayers = [];
        this.buffer = null;
        this.isMask = false;
        this.hasAnyContent = false;
    }

    createButtons() {
        let popId = `image_editor_layer_preview_${this.id}`;
        this.menuPopover.innerHTML = '';
        let buttonDelete = createDiv(null, 'sui_popover_model_button');
        buttonDelete.innerText = 'Delete Layer';
        buttonDelete.addEventListener('click', (e) => {
            e.preventDefault();
            hidePopover(popId);
            this.editor.removeLayer(this);
        }, true);
        this.menuPopover.appendChild(buttonDelete);
        let buttonConvert = createDiv(null, 'sui_popover_model_button');
        buttonConvert.innerText = `Convert To ${(this.isMask ? `Image` : `Mask`)} Layer`;
        buttonConvert.addEventListener('click', (e) => {
            e.preventDefault();
            hidePopover(popId);
            this.isMask = !this.isMask;
            this.infoSubDiv.innerText = (this.isMask ? `Mask` : `Image`);
            this.createButtons();
            this.editor.sortLayers();
            this.editor.redraw();
        }, true);
        this.menuPopover.appendChild(buttonConvert);
        let buttonInvert = createDiv(null, 'sui_popover_model_button');
        buttonInvert.innerText = `Invert ${(this.isMask ? `Mask` : `Colors`)}`;
        buttonInvert.addEventListener('click', (e) => {
            e.preventDefault();
            hidePopover(popId);
            this.invert();
        }, true);
        this.menuPopover.appendChild(buttonInvert);
        let sliderWrapper = createDiv(null, 'auto-slider-range-wrapper');
        let opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.className = 'auto-slider-range';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.step = '1';
        opacitySlider.value = this.opacity * 100;
        opacitySlider.oninput = e => updateRangeStyle(e);
        opacitySlider.onchange = e => updateRangeStyle(e);
        opacitySlider.addEventListener('input', () => {
            this.opacity = parseInt(opacitySlider.value) / 100;
            this.canvas.style.opacity = this.opacity;
            this.editor.redraw();
        });
        let opacityLabel = document.createElement('label');
        opacityLabel.innerHTML = 'Opacity&nbsp;';
        let opacityDiv = createDiv(null, 'sui-popover-inline-block');
        opacityDiv.appendChild(opacityLabel);
        sliderWrapper.appendChild(opacitySlider);
        opacityDiv.appendChild(sliderWrapper);
        this.menuPopover.appendChild(opacityDiv);
        updateRangeStyle(opacitySlider);
    }

    getOffset() {
        let offseter = this;
        let [x, y] = [0, 0];
        while (offseter) {
            x += offseter.offsetX;
            y += offseter.offsetY;
            offseter = offseter.parent;
        }
        return [Math.round(x), Math.round(y)];
    }

    ensureSize() {
        if (this.canvas.width != this.width || this.canvas.height != this.height) {
            this.resize(this.width, this.height);
        }
    }

    resize(width, height) {
        width = Math.round(width);
        height = Math.round(height);
        let newCanvas = document.createElement('canvas');
        newCanvas.width = width;
        newCanvas.height = height;
        let newCtx = newCanvas.getContext('2d');
        newCtx.drawImage(this.canvas, 0, 0, width, height);
        this.canvas = newCanvas;
        this.ctx = newCtx;
        this.width = width;
        this.height = height;
    }

    invert() {
        let newCanvas = document.createElement('canvas');
        newCanvas.width = this.canvas.width;
        newCanvas.height = this.canvas.height;
        let newCtx = newCanvas.getContext('2d');
        newCtx.save();
        newCtx.filter = 'invert(1)';
        newCtx.drawImage(this.canvas, 0, 0, newCanvas.width, newCanvas.height);
        newCtx.restore();
        this.canvas = newCanvas;
        this.ctx = newCtx;
        this.editor.redraw();
    }

    canvasCoordToLayerCoord(x, y) {
        let [x2, y2] = this.editor.canvasCoordToImageCoord(x, y);
        let [offsetX, offsetY] = this.getOffset();
        let relWidth = this.width / this.canvas.width;
        let relHeight = this.height / this.canvas.height;
        [x2, y2] = [x2 - offsetX, y2 - offsetY];
        let angle = -this.rotation;
        let [cx, cy] = [this.width / 2, this.height / 2];
        let [x3, y3] = [x2 - cx, y2 - cy];
        [x3, y3] = [x3 * Math.cos(angle) - y3 * Math.sin(angle), x3 * Math.sin(angle) + y3 * Math.cos(angle)];
        [x2, y2] = [x3 + cx, y3 + cy];
        [x2, y2] = [x2 / relWidth, y2 / relHeight];
        return [x2, y2];
    }

    layerCoordToCanvasCoord(x, y) {
        let [offsetX, offsetY] = this.getOffset();
        let relWidth = this.width / this.canvas.width;
        let relHeight = this.height / this.canvas.height;
        let [x2, y2] = [x * relWidth, y * relHeight];
        let angle = this.rotation;
        let [cx, cy] = [this.width / 2, this.height / 2];
        let [x3, y3] = [x2 - cx, y2 - cy];
        [x3, y3] = [x3 * Math.cos(angle) - y3 * Math.sin(angle), x3 * Math.sin(angle) + y3 * Math.cos(angle)];
        [x2, y2] = [x3 + cx, y3 + cy];
        [x2, y2] = [x2 + offsetX, y2 + offsetY];
        [x2, y2] = this.editor.imageCoordToCanvasCoord(x2, y2);
        return [x2, y2];
    }

    drawFilledCircle(x, y, radius, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    drawFilledCircleStrokeBetween(x1, y1, x2, y2, radius, color) {
        let angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
        let [rx, ry] = [radius * Math.cos(angle), radius * Math.sin(angle)];
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(x1 + rx, y1 + ry);
        this.ctx.lineTo(x2 + rx, y2 + ry);
        this.ctx.lineTo(x2 - rx, y2 - ry);
        this.ctx.lineTo(x1 - rx, y1 - ry);
        this.ctx.closePath();
        this.ctx.fill();
    }

    drawToBackDirect(ctx, offsetX, offsetY, zoom) {
        ctx.save();
        let [thisOffsetX, thisOffsetY] = this.getOffset();
        let x = offsetX + thisOffsetX;
        let y = offsetY + thisOffsetY;
        ctx.globalAlpha = this.opacity;
        ctx.globalCompositeOperation = this.globalCompositeOperation;
        let [cx, cy] = [this.width / 2, this.height / 2];
        ctx.translate((x + cx) * zoom, (y + cy) * zoom);
        ctx.rotate(this.rotation);
        if (zoom > 5) {
            ctx.imageSmoothingEnabled = false;
        }
        ctx.drawImage(this.canvas, -cx * zoom, -cy * zoom, this.width * zoom, this.height * zoom);
        ctx.restore();
    }

    drawToBack(ctx, offsetX, offsetY, zoom) {
        if (this.childLayers.length > 0) {
            if (this.buffer == null) {
                this.buffer = new ImageEditorLayer(this.editor, this.canvas.width, this.canvas.height);
                this.buffer.width = this.width;
                this.buffer.height = this.height;
                this.buffer.rotation = this.rotation;
            }
            let offset = this.getOffset();
            this.buffer.offsetX = this.offsetX;
            this.buffer.offsetY = this.offsetY;
            this.buffer.opacity = this.opacity;
            this.buffer.globalCompositeOperation = this.globalCompositeOperation;
            this.buffer.ctx.globalAlpha = 1;
            this.buffer.ctx.globalCompositeOperation = 'source-over';
            this.buffer.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.buffer.ctx.drawImage(this.canvas, 0, 0);
            for (let layer of this.childLayers) {
                layer.drawToBack(this.buffer.ctx, -offset[0], -offset[1], 1);
            }
            this.buffer.drawToBackDirect(ctx, offsetX, offsetY, zoom);
        }
        else {
            this.buffer = null;
            this.drawToBackDirect(ctx, offsetX, offsetY, zoom);
        }
    }

    /** Saves undo state, clears all content, and marks the layer as empty. */
    clearToEmpty() {
        this.saveBeforeEdit();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.hasAnyContent = false;
    }

    applyMaskFromImage(img) {
        this.saveBeforeEdit();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        let imageData;
        if (this.rotation == 0) {
            let [offsetX, offsetY] = this.getOffset();
            this.ctx.drawImage(img, offsetX, offsetY, this.width, this.height, 0, 0, this.canvas.width, this.canvas.height);
            imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
        else {
            let tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvas.width;
            tempCanvas.height = this.canvas.height;
            let tempCtx = tempCanvas.getContext('2d');
            let [offsetX, offsetY] = this.getOffset();
            let relWidth = this.width / this.canvas.width;
            let relHeight = this.height / this.canvas.height;
            let cx = this.width / 2;
            let cy = this.height / 2;
            let cosR = Math.cos(-this.rotation);
            let sinR = Math.sin(-this.rotation);
            tempCtx.setTransform(
                cosR / relWidth, sinR / relHeight,
                -sinR / relWidth, cosR / relHeight,
                (-cosR * (offsetX + cx) + sinR * (offsetY + cy) + cx) / relWidth,
                (-sinR * (offsetX + cx) - cosR * (offsetY + cy) + cy) / relHeight
            );
            tempCtx.drawImage(img, 0, 0, img.width || this.editor.realWidth, img.height || this.editor.realHeight, 0, 0, this.editor.realWidth, this.editor.realHeight);
            imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        }
        let data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let brightness = data[i] + data[i + 1] + data[i + 2];
            if (brightness < 128) {
                data[i + 3] = 0;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
        this.hasAnyContent = true;
    }

    saveBeforeEdit() {
        let oldCanvas = document.createElement('canvas');
        oldCanvas.width = this.canvas.width;
        oldCanvas.height = this.canvas.height;
        let oldCtx = oldCanvas.getContext('2d');
        oldCtx.drawImage(this.canvas, 0, 0);
        let history = new ImageEditorHistoryEntry(this.editor, 'layer_canvas_edit', { layer: this, oldCanvas: oldCanvas, oldOffsetX: this.offsetX, oldOffsetY: this.offsetY, oldRotation: this.rotation, oldWidth: this.width, oldHeight: this.height });
        this.editor.addHistoryEntry(history);
    }

    savePositions() {
        let history = new ImageEditorHistoryEntry(this.editor, 'layer_reposition', { layer: this, oldOffsetX: this.offsetX, oldOffsetY: this.offsetY, oldRotation: this.rotation, oldWidth: this.width, oldHeight: this.height });
        this.editor.addHistoryEntry(history);
    }
}

/**
 * A single history entry for the image editor, for Undo processing.
 */
class ImageEditorHistoryEntry {
    constructor(editor, type, data) {
        this.editor = editor;
        this.type = type;
        this.data = data;
    }

    undo() {
        if (this.type == 'layer_canvas_edit') {
            let oldCanvas = this.data.oldCanvas;
            let ctx = this.data.layer.ctx;
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(oldCanvas, 0, 0);
            this.data.layer.offsetX = this.data.oldOffsetX;
            this.data.layer.offsetY = this.data.oldOffsetY;
            this.data.layer.rotation = this.data.oldRotation;
            this.data.layer.width = this.data.oldWidth;
            this.data.layer.height = this.data.oldHeight;
        }
        else if (this.type == 'layer_reposition') {
            this.data.layer.offsetX = this.data.oldOffsetX;
            this.data.layer.offsetY = this.data.oldOffsetY;
            this.data.layer.rotation = this.data.oldRotation;
            this.data.layer.width = this.data.oldWidth;
            this.data.layer.height = this.data.oldHeight;
        }
        else if (this.type == 'layer_add' && this.editor.layers.indexOf(this.data.layer) >= 0) {
            this.editor.removeLayer(this.data.layer, true);
        }
        else if (this.type == 'layer_remove') {
            // TODO: Reinsert at proper index
            this.editor.addLayer(this.data.layer, true);
        }
    }
}

/**
 * The central class managing the image editor interface.
 */
class ImageEditor {
    constructor(div, allowMasks = true, useExperimental = true, doFit = null, signalChanged = null) {
        // Configurables:
        this.zoomRate = 1.1;
        this.gridScale = 4;
        this.backgroundColor = '#202020';
        this.gridColor = '#404040';
        this.uiColor = '#606060';
        this.uiBorderColor = '#b0b0b0';
        this.textColor = '#ffffff';
        this.boundaryColor = '#ffff00';
        // Data:
        this.doFit = doFit;
        this.signalChanged = signalChanged;
        this.onActivate = null;
        this.onDeactivate = null;
        this.changeCount = 0;
        this.active = false;
        this.inputDiv = div;
        this.inputDiv.tabIndex = -1;
        this.leftBar = createDiv(null, 'image_editor_leftbar');
        this.inputDiv.appendChild(this.leftBar);
        this.rightBar = createDiv(null, 'image_editor_rightbar');
        this.rightBar.innerHTML = `<div class="image_editor_newlayer_button basic-button image-editor-close-button interrupt-button" title="Close the Image Editor">&times;</div>`;
        this.rightBar.innerHTML += `<div class="image_editor_newlayer_button basic-button new-image-layer-button" title="New Image Layer">+${allowMasks ? 'Image' : 'Layer'}</div>`;
        if (allowMasks) {
            this.rightBar.innerHTML += `<div class="image_editor_newlayer_button basic-button new-mask-layer-button" title="New Mask Layer">+Mask</div>`;
        }
        this.inputDiv.appendChild(this.rightBar);
        this.rightBar.querySelector('.image-editor-close-button').addEventListener('click', () => {
            this.deactivate();
        });
        this.rightBar.querySelector('.new-image-layer-button').addEventListener('click', () => {
            this.addEmptyLayer();
        });
        if (allowMasks) {
            this.rightBar.querySelector('.new-mask-layer-button').addEventListener('click', () => {
                this.addEmptyMaskLayer();
            });
        }
        this.canvasList = createDiv(null, 'image_editor_canvaslist');
        // canvas entries can be dragged
        this.canvasList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        this.canvasList.addEventListener('drop', (e) => {
            let target = findParentOfClass(e.target, 'image_editor_layer_preview');
            if (!target) {
                return;
            }
            let dragIndex = this.layers.indexOf(this.draggingLayer);
            let targetIndex = this.layers.indexOf(target.layer);
            if (dragIndex < 0 || targetIndex < 0 || dragIndex == targetIndex) {
                return;
            }
            this.layers.splice(dragIndex, 1);
            targetIndex = this.layers.indexOf(target.layer);
            if (e.offsetY > target.clientHeight / 2) {
                if (target.nextSibling) {
                    this.canvasList.insertBefore(this.draggingLayer.div, target.nextSibling);
                }
                else {
                    this.canvasList.appendChild(this.draggingLayer.div);
                }
            }
            else {
                targetIndex++;
                this.canvasList.insertBefore(this.draggingLayer.div, target);
            }
            this.layers.splice(targetIndex, 0, this.draggingLayer);
            this.sortLayers();
            this.redraw();
        });
        this.canvasList.addEventListener('dragenter', (e) => {
            e.preventDefault();
        });
        this.rightBar.appendChild(this.canvasList);
        this.bottomBar = createDiv(null, 'image_editor_bottombar');
        this.inputDiv.appendChild(this.bottomBar);
        this.layers = [];
        this.activeLayer = null;
        this.clearVars();
        // Tools:
        this.tools = {};
        this.toolHotkeys = {};
        this.addTool(new ImageEditorToolOptions(this));
        this.addTool(new ImageEditorToolGeneral(this));
        this.addTool(new ImageEditorToolMove(this));
        this.addTool(new ImageEditorToolSelect(this));
        this.addTool(new ImageEditorToolBrush(this, 'brush', 'paintbrush', 'Paintbrush', 'Draw on the image.\nHotKey: B', false, 'b'));
        this.addTool(new ImageEditorToolBrush(this, 'eraser', 'eraser', 'Eraser', 'Erase parts of the image.\nHotKey: E', true, 'e'));
        this.addTool(new ImageEditorToolBucket(this));
        this.addTool(new ImageEditorToolShape(this));
        this.pickerTool = new ImageEditorToolPicker(this, 'picker', 'paintbrush', 'Color Picker', 'Pick a color from the image.');
        this.addTool(this.pickerTool);
        this.addTool(new ImageEditorToolSam2Points(this));
        this.addTool(new ImageEditorToolSam2BBox(this));
        this.activateTool('brush');
        this.maxHistory = 15;
        $('#image_editor_debug_modal').on('hidden.bs.modal', () => {
            document.getElementById('image_editor_debug_images').innerHTML = '';
        });
        let pastebox = document.getElementById('image_editor_paste_pastebox');
        if (pastebox) {
            pastebox.onpaste = (e) => this.handlePasteModalPaste(e);
        }
    }

    clearVars() {
        this.totalLayersEver = 0;
        this.mouseDown = false;
        this.zoomLevel = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.realWidth = 512;
        this.realHeight = 512;
        this.finalOffsetX = 0;
        this.finalOffsetY = 0;
        this.selectX = 0;
        this.selectY = 0;
        this.selectWidth = 0;
        this.selectHeight = 0;
        this.hasSelection = false;
        this.editHistory = [];
    }

    addHistoryEntry(entry) {
        if (this.editHistory.length >= this.maxHistory) {
            this.editHistory.splice(0, 1);
        }
        this.editHistory.push(entry);
    }

    undoOnce() {
        if (this.editHistory.length > 0) {
            let entry = this.editHistory.pop();
            entry.undo();
            this.redraw();
        }
    }

    addTool(tool) {
        this.tools[tool.id] = tool;
        if (tool.hotkey) {
            this.toolHotkeys[tool.hotkey] = tool.id;
        }
    }

    activateTool(id) {
        let newTool = this.tools[id];
        if (!newTool) {
            throw new Error(`Tool ${id} not found`);
        }
        if (newTool.div && newTool.div.style.display == 'none') {
            return;
        }
        if (this.activeTool && !newTool.isTempTool) {
            this.activeTool.setInactive();
        }
        newTool.setActive();
        this.activeTool = newTool;
    }

    createCanvas() {
        let canvas = document.createElement('canvas');
        canvas.className = 'image-editor-canvas';
        this.inputDiv.insertBefore(canvas, this.rightBar);
        this.canvas = canvas;
        canvas.addEventListener('wheel', (e) => this.onMouseWheel(e));
        document.addEventListener('mousedown', (e) => this.onGlobalMouseDown(e));
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onGlobalMouseUp(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('mousemove', (e) => this.onGlobalMouseMove(e));
        document.addEventListener('touchstart', (e) => this.onGlobalMouseDown(e));
        canvas.addEventListener('touchstart', (e) => this.onMouseDown(e));
        document.addEventListener('touchend', (e) => this.onGlobalMouseUp(e));
        canvas.addEventListener('touchend', (e) => this.onMouseUp(e));
        document.addEventListener('touchmove', (e) => this.onGlobalMouseMove(e));
        this.inputDiv.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.inputDiv.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('keydown', (e) => this.onGlobalKeyDown(e));
        document.addEventListener('keyup', (e) => this.onGlobalKeyUp(e));
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        canvas.addEventListener('drop', (e) => this.handleCanvasImageDrop(e));
        canvas.addEventListener('contextmenu', (e) => {
            if (this.activeTool && this.activeTool.onContextMenu(e)) {
                e.preventDefault();
            }
        });
        this.ctx = canvas.getContext('2d');
        canvas.style.cursor = 'none';
        this.maskHelperCanvas = document.createElement('canvas');
        this.maskHelperCtx = this.maskHelperCanvas.getContext('2d');
        this.resize();
        this.autoZoom();
    }

    autoZoom() {
        this.zoomLevel = Math.min(this.canvas.width / this.realWidth, this.canvas.height / this.realHeight) * 0.9;
        let [x, y] = this.imageCoordToCanvasCoord(this.realWidth / 2, this.realHeight / 2);
        this.offsetX = this.canvas.width / 2 - x;
        this.offsetY = this.canvas.height / 2 - y;
    }

    handleCanvasImageDrop(e) {
        if (!e.dataTransfer.files || e.dataTransfer.files.length <= 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        for (let file of e.dataTransfer.files) {
            if (!file.type.startsWith('image/')) {
                continue;
            }
            let reader = new FileReader();
            reader.onload = (ev) => {
                this.addImageLayerFromClipboard(ev.target.result);
            };
            reader.readAsDataURL(file);
        }
    }

    handleAltDown() {
        if (!this.preAltTool) {
            this.preAltTool = this.activeTool;
            this.activateTool('general');
            this.redraw();
        }
    }

    handleAltUp() {
        if (this.preAltTool) {
            this.activateTool(this.preAltTool.id);
            this.preAltTool = null;
            this.redraw();
        }
    }

    /**
     * Copies the current selection as image data to the clipboard. No-op if there's no selection.
     * @param {boolean} currentLayerOnly - If true, copy only the active layer in the selection; if false, copy the full composited image.
     * Returns true if the copy was initiated, false otherwise.
     */
    copySelectionToClipboard(currentLayerOnly = false) {
        if (!this.hasSelection || this.selectWidth <= 0 || this.selectHeight <= 0 || (currentLayerOnly && !this.activeLayer)) {
            doNoticePopover('No selection to copy!', 'notice-pop-red');
            return false;
        }
        let layerOnly = currentLayerOnly ? this.activeLayer : null;
        copyImageToClipboard(this.getImageWithBounds(this.selectX, this.selectY, this.selectWidth, this.selectHeight, 'image/png', layerOnly));
        doNoticePopover('Copied!', 'notice-pop-green');
        return true;
    }

    /**
     * Handles paste in the fallback modal textbox: reads image from e.clipboardData and adds as layer.
     */
    handlePasteModalPaste(e) {
        let items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData)) ? (e.clipboardData || e.originalEvent.clipboardData).items : null;
        if (!items) {
            return;
        }
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind == 'file') {
                let file = items[i].getAsFile();
                if (file && file.type.startsWith('image/')) {
                    e.preventDefault();
                    let reader = new FileReader();
                    reader.onload = (ev) => {
                        this.addImageLayerFromClipboard(ev.target.result);
                    };
                    reader.readAsDataURL(file);
                    return;
                }
            }
        }
    }

    /**
     * Pastes the selection from the clipboard to the image editor as a new image layer.
     * No-op if the clipboard does not contain image data. Shows modal fallback when Clipboard API is unavailable.
     */
    pasteSelectionFromClipboard() {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            let box = document.getElementById('image_editor_paste_pastebox');
            box.value = '';
            $('#image_editor_paste_modal').modal('show');
            box.focus();
            return;
        }
        navigator.clipboard.read().then((items) => {
            let found = false;
            for (let item of items) {
                for (let type of item.types) {
                    if (type.startsWith('image/')) {
                        found = true;
                        item.getType(type).then((blob) => {
                            let reader = new FileReader();
                            reader.onload = (ev) => {
                                this.addImageLayerFromClipboard(ev.target.result);
                            };
                            reader.readAsDataURL(blob);
                        });
                        return;
                    }
                }
            }
            if (!found) {
                doNoticePopover('No image in clipboard', 'notice-pop-red');
            }
        });
    }

    activeElementIsAnInput() {
        return document.activeElement.tagName == 'INPUT' || document.activeElement.tagName == 'TEXTAREA';
    }

    onKeyDown(e) {
        if (e.key == 'Alt') {
            e.preventDefault();
            this.handleAltDown();
        }
        if (e.ctrlKey && e.key == 'z') {
            e.preventDefault();
            this.undoOnce();
        }
        // TODO: Expose a keydown event to tools rather than this global handler only
        if (e.ctrlKey && e.key == 'c' && !this.activeElementIsAnInput() && this.activeTool && this.activeTool.id == 'select') {
            this.copySelectionToClipboard(this.activeTool.copyMode == 'layer');
            e.preventDefault();
        }
        if (e.ctrlKey && e.key == 'v' && !this.activeElementIsAnInput()) {
            e.preventDefault();
            this.pasteSelectionFromClipboard();
        }
        if (e.key == 'Delete' && !this.activeElementIsAnInput() && this.activeTool && this.activeLayer) {
            if (this.activeTool.id == 'general') {
                e.preventDefault();
                this.removeLayer(this.activeLayer);
            }
            else if (this.activeTool.id == 'select') {
                e.preventDefault();
                this.clearSelectionOnLayer(this.activeLayer);
            }
        }
        if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            let toolId = this.toolHotkeys[e.key];
            if (toolId) {
                this.activateTool(toolId);
            }
        }
    }

    onGlobalKeyDown(e) {
        if (e.key == 'Alt') {
            this.altDown = true;
        }
    }

    onKeyUp() {
    }

    onGlobalKeyUp(e) {
        if (e.key == 'Alt') {
            this.altDown = false;
            this.handleAltUp();
        }
    }

    onGlobalMouseDown(e) {
        this.updateMousePosFrom(e);
    }

    onMouseWheel(e) {
        this.activeTool.onMouseWheel(e);
        if (!e.defaultPrevented) {
            let zoom = Math.pow(this.zoomRate, -e.deltaY / 100);
            let rect = this.canvas.getBoundingClientRect();
            let mouseX = e.clientX - rect.left;
            let mouseY = e.clientY - rect.top;
            let [origX, origY] = this.canvasCoordToImageCoord(mouseX, mouseY);
            this.zoomLevel = Math.max(0.01, Math.min(100, this.zoomLevel * zoom));
            let [newX, newY] = this.canvasCoordToImageCoord(mouseX, mouseY);
            this.offsetX += newX - origX;
            this.offsetY += newY - origY;
        }
        this.redraw();
    }

    onMouseDown(e) {
        if (this.altDown || e.button == 1) {
            this.handleAltDown();
        }
        this.mouseDown = true;
        this.activeTool.onMouseDown(e);
        this.redraw();
    }

    onMouseUp(e) {
        if (e.button == 1) {
            this.handleAltUp();
        }
        this.mouseDown = false;
        this.activeTool.onMouseUp(e);
        this.redraw();
    }

    onGlobalMouseUp(e) {
        let wasDown = this.mouseDown;
        this.mouseDown = false;
        if (this.activeTool.onGlobalMouseUp(e) || wasDown) {
            this.redraw();
        }
    }

    updateMousePosFrom(e) {
        let eX = e.clientX, eY = e.clientY;
        if (!eX && !eY && e.touches && e.touches.length > 0) {
            eX = e.touches[0].clientX;
            eY = e.touches[0].clientY;
        }
        let rect = this.canvas.getBoundingClientRect();
        this.mouseX = eX - rect.left;
        this.mouseY = eY - rect.top;
    }

    onGlobalMouseMove(e) {
        this.updateMousePosFrom(e);
        let draw = false;
        if (this.isMouseInBox(0, 0, this.canvas.width, this.canvas.height)) {
            this.activeTool.onMouseMove(e);
            draw = true;
        }
        if (this.activeTool.onGlobalMouseMove(e)) {
            draw = true;
        }
        if (draw) {
            this.redraw();
        }
        this.lastMouseX = this.mouseX;
        this.lastMouseY = this.mouseY;
    }

    canvasCoordToImageCoord(x, y) {
        return [x / this.zoomLevel - this.offsetX, y / this.zoomLevel - this.offsetY];
    }

    imageCoordToCanvasCoord(x, y) {
        return [(x + this.offsetX) * this.zoomLevel, (y + this.offsetY) * this.zoomLevel];
    }

    isMouseInBox(x, y, width, height) {
        return this.mouseX >= x && this.mouseX < x + width && this.mouseY >= y && this.mouseY < y + height;
    }

    isMouseInCircle(x, y, radius) {
        let dx = this.mouseX - x;
        let dy = this.mouseY - y;
        return dx * dx + dy * dy < radius * radius;
    }

    activate() {
        if (this.onActivate) {
            this.onActivate();
        }
        this.active = true;
        this.inputDiv.style.display = 'inline-block';
        this.doParamHides();
        this.doFit();
        if (!this.canvas) {
            this.createCanvas();
            this.redraw();
        }
        else {
            this.resize();
        }
        if (!this.redrawInterval) {
            this.redrawInterval = setInterval(() => this.redraw(), 250);
        }
    }

    deactivate() {
        if (this.redrawInterval) {
            clearInterval(this.redrawInterval);
            this.redrawInterval = null;
        }
        if (this.onDeactivate) {
            this.onDeactivate();
        }
        for (let tool of Object.values(this.tools)) {
            if (tool.colorControl) {
                tool.colorControl.closePopout();
            }
        }
        this.active = false;
        this.inputDiv.style.display = 'none';
        this.unhideParams();
        this.doFit();
    }

    setActiveLayer(layer) {
        if (this.activeLayer && this.activeLayer.div) {
            this.activeLayer.div.classList.remove('image_editor_layer_preview-active');
        }
        if (this.layers.indexOf(layer) == -1) {
            throw new Error(`layer not found, ${layer}`);
        }
        let oldLayer = this.activeLayer;
        this.activeLayer = layer;
        if (layer && layer.div) {
            layer.div.classList.add('image_editor_layer_preview-active');
        }
        for (let tool of Object.values(this.tools)) {
            tool.onLayerChanged(oldLayer, layer);
        }
        this.redraw();
    }

    clearLayers() {
        this.layers = [];
        this.activeLayer = null;
        this.realWidth = 512;
        this.realHeight = 512;
        this.finalOffsetX = 0;
        this.finalOffsetY = 0;
        this.canvasList.innerHTML = '';
    }

    addEmptyMaskLayer() {
        let layer = new ImageEditorLayer(this, this.realWidth, this.realHeight);
        layer.isMask = true;
        this.addLayer(layer);
    }

    addEmptyLayer() {
        let layer = new ImageEditorLayer(this, this.realWidth, this.realHeight);
        this.addLayer(layer);
    }

    addImageLayer(img) {
        let layer = new ImageEditorLayer(this, img.naturalWidth || img.width, img.naturalHeight || img.height);
        layer.ctx.drawImage(img, 0, 0);
        layer.hasAnyContent = true;
        this.addLayer(layer);
        return layer;
    }

    /**
     * Loads an image from a URL (data URL or object URL) and adds it as a new layer.
     */
    addImageLayerFromClipboard(src) {
        let img = new Image();
        img.onload = () => {
            let layer = this.addImageLayer(img);
            let [mouseX, mouseY] = this.canvasCoordToImageCoord(this.mouseX, this.mouseY);
            layer.offsetX = mouseX - layer.width / 2;
            layer.offsetY = mouseY - layer.height / 2;
            this.activateTool('general');
            this.redraw();
        };
        img.src = src;
    }

    removeLayer(layer, skipHistory = false) {
        let index = this.layers.indexOf(layer);
        if (index >= 0) {
            if (!skipHistory) {
                this.addHistoryEntry(new ImageEditorHistoryEntry(this, 'layer_remove', { layer: layer, index: index }));
            }
            this.layers.splice(index, 1);
            this.canvasList.removeChild(layer.div);
            this.canvasList.removeChild(layer.menuPopover);
            if (this.activeLayer == layer) {
                this.setActiveLayer(this.layers[Math.max(0, index - 1)]);
            }
            this.redraw();
        }
    }

    addLayer(layer, skipHistory = false) {
        layer.id = this.totalLayersEver++;
        this.layers.push(layer);
        layer.div = createDiv(null, 'image_editor_layer_preview');
        layer.div.appendChild(layer.canvas);
        let infoDiv = createDiv(null, 'image_editor_layer_info');
        let infoSubDiv = createDiv(null, 'image_editor_layer_info_sub');
        infoSubDiv.innerText = (layer.isMask ? `Mask` : `Image`);
        infoDiv.appendChild(infoSubDiv);
        layer.infoSubDiv = infoSubDiv;
        layer.div.appendChild(infoDiv);
        layer.div.addEventListener('click', (e) => {
            if (e.defaultPrevented) {
                return;
            }
            this.setActiveLayer(layer);
            this.redraw();
        }, true);
        // the div is draggable to re-order:
        layer.div.draggable = true;
        layer.div.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', 'dummy');
            e.dataTransfer.effectAllowed = 'move';
            this.draggingLayer = layer;
        });
        layer.div.addEventListener('dragend', (e) => {
            this.draggingLayer = null;
        });
        layer.div.layer = layer;
        let popId = `image_editor_layer_preview_${layer.id}`;
        let menuPopover = createDiv(`popover_${popId}`, 'sui-popover');
        menuPopover.style.minWidth = '15rem';
        layer.menuPopover = menuPopover;
        layer.createButtons();
        layer.canvas.style.opacity = layer.opacity;
        layer.div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            menuPopover.style.top = `${e.clientY}px`;
            menuPopover.style.left = `${e.clientX}px`;
            showPopover(popId);
        });
        this.canvasList.appendChild(menuPopover);
        this.canvasList.insertBefore(layer.div, this.canvasList.firstChild);
        this.setActiveLayer(layer);
        this.sortLayers();
        if (!skipHistory) {
            this.addHistoryEntry(new ImageEditorHistoryEntry(this, 'layer_add', { layer: layer }));
        }
    }

    sortLayers() {
        let maskLayers = this.layers.filter(layer => layer.isMask);
        let imageLayers = this.layers.filter(layer => !layer.isMask);
        let newLayerList = imageLayers.concat(maskLayers);
        if (newLayerList.map(layer => layer.id).join(',') == this.layers.map(layer => layer.id).join(',')) {
            return;
        }
        this.layers = newLayerList;
        for (let layer of Array.from(this.layers).reverse()) {
            this.canvasList.appendChild(layer.div);
        }
    }

    setBaseImage(img) {
        this.clearLayers();
        let layer = new ImageEditorLayer(this, img.naturalWidth, img.naturalHeight);
        layer.ctx.drawImage(img, 0, 0);
        layer.hasAnyContent = true;
        this.addLayer(layer, true);
        let layer2 = new ImageEditorLayer(this, img.naturalWidth, img.naturalHeight);
        this.addLayer(layer2, true);
        let maskLayer = new ImageEditorLayer(this, img.naturalWidth, img.naturalHeight);
        maskLayer.isMask = true;
        this.addLayer(maskLayer, true);
        this.realWidth = img.naturalWidth;
        this.realHeight = img.naturalHeight;
        if (this.tools['sam2points']) {
            this.tools['sam2points'].layerPoints = new Map();
        }
        if (this.tools['sam2bbox']) {
            this.tools['sam2bbox'].bboxStartX = null;
            this.tools['sam2bbox'].bboxStartY = null;
            this.tools['sam2bbox'].bboxEndX = null;
            this.tools['sam2bbox'].bboxEndY = null;
        }
        this.offsetX = 0
        this.offsetY = 0;
        if (this.active) {
            this.autoZoom();
            this.redraw();
        }
    }

    doParamHides() {
        for (let paramId of ['input_initimage', 'input_maskimage']) {
            let elem = document.getElementById(paramId);
            if (elem) {
                elem.dataset.has_data = 'true';
                let parent = findParentOfClass(elem, 'auto-input');
                parent.style.display = 'none';
                parent.dataset.visible_controlled = 'true';
            }
        }
    }

    unhideParams() {
        for (let paramId of ['input_initimage', 'input_maskimage']) {
            let elem = document.getElementById(paramId);
            if (elem) {
                delete elem.dataset.has_data;
                let parent = findParentOfClass(elem, 'auto-input');
                parent.style.display = '';
                delete parent.dataset.visible_controlled;
            }
        }
    }

    renderFullGrid(scale, width, color) {
        this.ctx.strokeStyle = color;
        this.ctx.beginPath();
        this.ctx.lineWidth = width;
        let [leftX, topY] = this.canvasCoordToImageCoord(0, 0);
        let [rightX, bottomY] = this.canvasCoordToImageCoord(this.canvas.width, this.canvas.height);
        for (let x = Math.floor(leftX / scale) * scale; x < rightX; x += scale) {
            let [canvasX, _] = this.imageCoordToCanvasCoord(x, 0);
            this.ctx.moveTo(canvasX, 0);
            this.ctx.lineTo(canvasX, this.canvas.height);
        }
        for (let y = Math.floor(topY / scale) * scale; y < bottomY; y += scale) {
            let [_, canvasY] = this.imageCoordToCanvasCoord(0, y);
            this.ctx.moveTo(0, canvasY);
            this.ctx.lineTo(this.canvas.width, canvasY);
        }
        this.ctx.stroke();
    }

    autoWrapText(text, maxWidth) {
        let lines = [];
        let rawLines = text.split('\n');
        for (let rawLine of rawLines) {
            let words = rawLine.split(' ');
            let line = '';
            for (let word of words) {
                let newLine = line + word + ' ';
                if (this.ctx.measureText(newLine).width > maxWidth) {
                    lines.push(line);
                    line = word + ' ';
                }
                else {
                    line = newLine;
                }
            }
            lines.push(line);
        }
        return lines;
    }

    drawTextBubble(text, font, x, y, maxWidth) {
        this.ctx.font = font;
        let lines = this.autoWrapText(text, maxWidth - 10);
        let widest = lines.map(line => this.ctx.measureText(line).width).reduce((a, b) => Math.max(a, b));
        let metrics = this.ctx.measureText(text);
        let fontHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
        this.drawBox(x - 1, y - 1, widest + 10, (fontHeight * lines.length) + 10, this.uiColor, this.uiBorderColor);
        let currentY = y;
        this.ctx.fillStyle = this.textColor;
        this.ctx.textBaseline = 'top';
        for (let line of lines) {
            this.ctx.fillText(line, x + 5, currentY + 5);
            currentY += fontHeight;
        }
    }

    drawBox(x, y, width, height, color, borderColor) {
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + width, y);
        this.ctx.lineTo(x + width, y + height);
        this.ctx.lineTo(x, y + height);
        this.ctx.closePath();
        this.ctx.fill();
        if (borderColor) {
            this.ctx.strokeStyle = borderColor;
            this.ctx.stroke();
        }
    }

    markChanged() {
        this.changeCount++;
        if (this.signalChanged) {
            this.signalChanged();
        }
    }

    resize() {
        if (this.canvas) {
            this.canvas.width = Math.max(100, this.inputDiv.clientWidth - this.leftBar.clientWidth - this.rightBar.clientWidth - 1);
            this.canvas.height = Math.max(100, this.inputDiv.clientHeight - this.bottomBar.clientHeight - 1);
            if (this.maskHelperCanvas) {
                this.maskHelperCanvas.width = this.canvas.width;
                this.maskHelperCanvas.height = this.canvas.height;
            }
            this.redraw();
            this.markChanged();
        }
    }

    drawSelectionBox(x, y, width, height, color, spacing, angle, offset = 0) {
        this.ctx.save();
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.setLineDash([spacing, spacing]);
        this.ctx.lineDashOffset = offset;
        if (color == 'diff') {
            this.ctx.globalCompositeOperation = 'difference';
            this.ctx.strokeStyle = 'white';
        }
        else {
            this.ctx.strokeStyle = color;
        }
        this.ctx.translate(x + width / 2, y + height / 2);
        this.ctx.rotate(angle);
        this.ctx.moveTo(-width / 2 - 1, -height / 2 - 1);
        this.ctx.lineTo(width / 2 + 1, -height / 2 - 1);
        this.ctx.lineTo(width / 2 + 1, height / 2 + 1);
        this.ctx.lineTo(-width / 2 - 1, height / 2 + 1);
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.restore();
    }

    redraw() {
        if (!this.canvas) {
            return;
        }
        this.ctx.save();
        this.canvas.style.cursor = this.activeTool.cursor;
        // Background:
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        let gridScale = this.gridScale;
        while (gridScale * this.zoomLevel < 32) {
            gridScale *= 8;
        }
        if (gridScale > this.gridScale) {
            let factor = (gridScale * this.zoomLevel - 32) / (32 * 8);
            let frac = factor * 100;
            this.renderFullGrid(gridScale / 8, 1, `color-mix(in srgb, ${this.gridColor} ${frac}%, ${this.backgroundColor})`);
        }
        this.renderFullGrid(gridScale, 3, this.gridColor);
        // Image layers:
        for (let layer of this.layers) {
            if (!layer.isMask) {
                layer.drawToBack(this.ctx, this.offsetX, this.offsetY, this.zoomLevel);
            }
        }
        // Masks:
        this.maskHelperCtx.clearRect(0, 0, this.maskHelperCanvas.width, this.maskHelperCanvas.height);
        for (let layer of this.layers) {
            if (layer.isMask) {
                layer.drawToBack(this.maskHelperCtx, this.offsetX, this.offsetY, this.zoomLevel);
            }
        }
        this.ctx.save();
        this.ctx.globalAlpha = this.activeLayer.isMask ? 0.8 : 0.3;
        this.ctx.globalCompositeOperation = 'luminosity';
        this.ctx.drawImage(this.maskHelperCanvas, 0, 0);
        this.ctx.restore();
        // UI:
        let [boundaryX, boundaryY] = this.imageCoordToCanvasCoord(this.finalOffsetX, this.finalOffsetY);
        this.drawSelectionBox(boundaryX, boundaryY, this.realWidth * this.zoomLevel, this.realHeight * this.zoomLevel, this.boundaryColor, 16 * this.zoomLevel, 0);
        let [offsetX, offsetY] = this.activeLayer.getOffset();
        [offsetX, offsetY] = this.imageCoordToCanvasCoord(offsetX, offsetY);
        this.drawSelectionBox(offsetX, offsetY, this.activeLayer.width * this.zoomLevel, this.activeLayer.height * this.zoomLevel, this.uiBorderColor, 8 * this.zoomLevel, this.activeLayer.rotation);
        if (this.hasSelection) {
            let [selectX, selectY] = this.imageCoordToCanvasCoord(this.selectX, this.selectY);
            let offset = (Math.floor(Date.now() / 250) % 4) * 4 * this.zoomLevel;
            this.drawSelectionBox(selectX, selectY, this.selectWidth * this.zoomLevel, this.selectHeight * this.zoomLevel, 'diff', 8 * this.zoomLevel, 0, offset);
        }
        this.activeTool.draw();
        this.ctx.restore();
        for (let tool of Object.values(this.tools)) {
            if (tool.colorControl) {
                tool.colorControl.refreshFloatingPanel();
            }
        }
    }

    getImageWithBounds(x, y, width, height, format = 'image/png', layerOnly = null) {
        x = Math.round(x);
        y = Math.round(y);
        width = Math.round(width);
        height = Math.round(height);
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        let ctx = canvas.getContext('2d');
        if (layerOnly != null) {
            layerOnly.drawToBack(ctx, this.finalOffsetX - x, this.finalOffsetY - y, 1);
        }
        else {
            for (let layer of this.layers) {
                if (!layer.isMask) {
                    layer.drawToBack(ctx, this.finalOffsetX - x, this.finalOffsetY - y, 1);
                }
            }
        }
        return canvas.toDataURL(format);
    }

    getFinalImageData(format = 'image/png') {
        let canvas = document.createElement('canvas');
        canvas.width = this.realWidth;
        canvas.height = this.realHeight;
        let ctx = canvas.getContext('2d');
        for (let layer of this.layers) {
            if (!layer.isMask) {
                layer.drawToBack(ctx, this.finalOffsetX, this.finalOffsetY, 1);
            }
        }
        return canvas.toDataURL(format);
    }

    getMaximumImageData(format = 'image/png') {
        let canvas = document.createElement('canvas');
        let maxX = this.realWidth, maxY = this.realHeight;
        let minX = 0, minY = 0;
        for (let layer of this.layers) {
            if (!layer.isMask) {
                let [x, y] = layer.getOffset();
                let [w, h] = [layer.width, layer.height];
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
            }
        }
        canvas.width = maxX - minX;
        canvas.height = maxY - minY;
        let ctx = canvas.getContext('2d');
        for (let layer of this.layers) {
            if (!layer.isMask) {
                layer.drawToBack(ctx, -minX, -minY, 1);
            }
        }
        return canvas.toDataURL(format);
    }

    getFinalMaskData(format = 'image/png') {
        let canvas = document.createElement('canvas');
        canvas.width = this.realWidth;
        canvas.height = this.realHeight;
        let ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (this.layers.some(l => l.isMask && l.hasAnyContent)) {
            // This is a hack to make transparency in the image layer turn into white on the mask (and areas with image go black unless masked)
            let imgCanvas = document.createElement('canvas');
            imgCanvas.width = this.realWidth / 4;
            imgCanvas.height = this.realHeight / 4;
            let imgctx = imgCanvas.getContext('2d');
            imgctx.clearRect(0, 0, imgCanvas.width, imgCanvas.height);
            for (let layer of this.layers) {
                if (!layer.isMask) {
                    layer.drawToBack(imgctx, this.finalOffsetX, this.finalOffsetY, 1.0 / 4);
                }
            }
            let imageData = imgctx.getImageData(0, 0, imgCanvas.width, imgCanvas.height);
            let buffer = new Uint8ClampedArray(imageData.data.buffer);
            let len = buffer.length;
            for (let i = 0; i < len; i += 4) {
                buffer[i] = 0;
                buffer[i + 1] = 0;
                buffer[i + 2] = 0;
            }
            imageData = new ImageData(buffer, imgCanvas.width, imgCanvas.height);
            imgctx.putImageData(imageData, 0, 0);
            ctx.drawImage(imgCanvas, 0, 0, canvas.width, canvas.height);
            for (let layer of this.layers) {
                if (layer.isMask) {
                    layer.drawToBack(ctx, this.finalOffsetX, this.finalOffsetY, 1);
                }
            }
        }
        // Force to black/white
        let canvas2 = document.createElement('canvas');
        canvas2.width = this.realWidth;
        canvas2.height = this.realHeight;
        let ctx2 = canvas2.getContext('2d');
        ctx2.fillStyle = '#000000';
        ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
        ctx2.globalCompositeOperation = 'luminosity';
        ctx2.drawImage(canvas, 0, 0);
        return canvas2.toDataURL(format);
    }

    clearSelectionOnLayer(layer) {
        if (!this.hasSelection || this.selectWidth == 0 || this.selectHeight == 0) {
            return;
        }
        let [cx1, cy1] = this.imageCoordToCanvasCoord(this.selectX, this.selectY);
        let [lx1, ly1] = layer.canvasCoordToLayerCoord(cx1, cy1);
        let [cx2, cy2] = this.imageCoordToCanvasCoord(this.selectX + this.selectWidth, this.selectY + this.selectHeight);
        let [lx2, ly2] = layer.canvasCoordToLayerCoord(cx2, cy2);
        let minX = Math.round(Math.min(lx1, lx2));
        let minY = Math.round(Math.min(ly1, ly2));
        let maxX = Math.round(Math.max(lx1, lx2));
        let maxY = Math.round(Math.max(ly1, ly2));
        minX = Math.max(0, Math.min(minX, layer.canvas.width));
        minY = Math.max(0, Math.min(minY, layer.canvas.height));
        maxX = Math.max(0, Math.min(maxX, layer.canvas.width));
        maxY = Math.max(0, Math.min(maxY, layer.canvas.height));
        let width = maxX - minX;
        let height = maxY - minY;
        if (width <= 0 || height <= 0) {
            return;
        }
        layer.saveBeforeEdit();
        layer.ctx.clearRect(minX, minY, width, height);
        this.redraw();
    }

    /** Shows a debug image in a stacking modal. Accepts a data URL, Image, or Canvas. */
    showDebugImage(imageSource) {
        let container = document.getElementById('image_editor_debug_images');
        let modal = document.getElementById('image_editor_debug_modal');
        let img = document.createElement('img');
        img.style.maxWidth = '100%';
        img.style.display = 'block';
        img.style.marginBottom = '8px';
        img.style.border = '1px solid var(--light-border)';
        if (typeof imageSource == 'string') {
            img.src = imageSource;
        }
        else if (imageSource instanceof HTMLCanvasElement) {
            img.src = imageSource.toDataURL('image/png');
        }
        else if (imageSource instanceof Image) {
            img.src = imageSource.src;
        }
        if (!modal.classList.contains('show')) {
            container.innerHTML = '';
            $(modal).modal('show');
        }
        container.appendChild(img);
    }

    /** Closes the debug image modal and clears its contents. */
    closeDebugImages() {
        let container = document.getElementById('image_editor_debug_images');
        container.innerHTML = '';
        $('#image_editor_debug_modal').modal('hide');
    }
}
