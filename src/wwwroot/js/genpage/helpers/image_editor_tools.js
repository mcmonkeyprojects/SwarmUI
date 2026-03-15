
/**
 * Base class for an image editor tool, such as Paintbrush or the General tool.
 */
class ImageEditorTool {
    constructor(editor, id, icon, name, description, hotkey = null) {
        this.editor = editor;
        this.isTempTool = false;
        this.isMaskOnly = false;
        this.id = id;
        this.icon = icon;
        this.iconImg = new Image();
        this.iconImg.src = `imgs/${icon}.png`;
        this.name = name;
        this.description = description;
        this.active = false;
        this.cursor = 'crosshair';
        this.hotkey = hotkey;
        this.makeDivs();
    }

    makeDivs() {
        this.infoBubble = createDiv(null, 'sui-popover');
        this.infoBubble.innerHTML = `<div class="image-editor-info-bubble-title">${escapeHtml(this.name)}</div><div class="image-editor-info-bubble-description">${escapeHtml(this.description)}</div>`;
        this.div = document.createElement('div');
        this.div.className = 'image-editor-tool';
        this.div.style.backgroundImage = `url(imgs/${this.icon}.png)`;
        this.div.addEventListener('click', () => this.onClick());
        this.div.addEventListener('mouseenter', () => {
            this.infoBubble.style.top = `${this.div.offsetTop}px`;
            this.infoBubble.style.left = `${this.div.offsetLeft + this.div.clientWidth + 5}px`;
            this.infoBubble.classList.add('sui-popover-visible');
        });
        this.div.addEventListener('mouseleave', () => {
            this.infoBubble.classList.remove('sui-popover-visible');
        });
        this.editor.leftBar.appendChild(this.infoBubble);
        this.editor.leftBar.appendChild(this.div);
        this.configDiv = document.createElement('div');
        this.configDiv.className = 'image-editor-tool-bottombar';
        this.configDiv.style.display = 'none';
        this.editor.bottomBar.appendChild(this.configDiv);
    }

    onClick() {
        this.editor.activateTool(this.id);
    }

    setActive() {
        if (this.active) {
            return;
        }
        this.active = true;
        this.div.classList.add('image-editor-tool-selected');
        this.configDiv.style.display = 'flex';
    }

    setInactive() {
        if (!this.active) {
            return;
        }
        this.active = false;
        this.div.classList.remove('image-editor-tool-selected');
        this.configDiv.style.display = 'none';
    }

    draw() {
    }

    drawCircleBrush(x, y, radius) {
        this.editor.ctx.strokeStyle = '#ffffff';
        this.editor.ctx.lineWidth = 1;
        this.editor.ctx.globalCompositeOperation = 'difference';
        this.editor.ctx.beginPath();
        this.editor.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.editor.ctx.stroke();
        this.editor.ctx.globalCompositeOperation = 'source-over';
    }

    onMouseDown(e) {
    }

    onMouseUp(e) {
    }

    onMouseMove(e) {
    }

    onMouseWheel(e) {
    }

    onGlobalMouseMove(e) {
        return false;
    }

    onGlobalMouseUp(e) {
        return false;
    }

    onContextMenu(e) {
        return false;
    }

    onLayerChanged(oldLayer, newLayer) {
        if (this.isMaskOnly) {
            let isMask = newLayer && newLayer.isMask;
            this.div.style.display = isMask ? '' : 'none';
            if (!isMask && this.active) {
                this.editor.activateTool('brush');
            }
        }
    }

    /** Returns the current selection rectangle in layer-local pixel coordinates, or null if no selection is active. */
    getSelectionBoundsInLayer(layer) {
        if (!this.editor.hasSelection) {
            return null;
        }
        let [cx1, cy1] = this.editor.imageCoordToCanvasCoord(this.editor.selectX, this.editor.selectY);
        let [lx1, ly1] = layer.canvasCoordToLayerCoord(cx1, cy1);
        let [cx2, cy2] = this.editor.imageCoordToCanvasCoord(this.editor.selectX + this.editor.selectWidth, this.editor.selectY + this.editor.selectHeight);
        let [lx2, ly2] = layer.canvasCoordToLayerCoord(cx2, cy2);
        return {
            minX: Math.round(Math.min(lx1, lx2)),
            minY: Math.round(Math.min(ly1, ly2)),
            maxX: Math.round(Math.max(lx1, lx2)),
            maxY: Math.round(Math.max(ly1, ly2))
        };
    }

    /** Applies the current selection as a clip rect on the given canvas context, in layer-local coordinates. No-op if no selection. */
    applySelectionClip(ctx, layer) {
        let bounds = this.getSelectionBoundsInLayer(layer);
        if (!bounds) {
            return;
        }
        ctx.beginPath();
        ctx.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        ctx.clip();
    }
}

/**
 * A special temporary tool, a wrapper of the base tool class that prevents default behaviors.
 */
class ImageEditorTempTool extends ImageEditorTool {
    constructor(editor, id, icon, name, description, hotkey = null) {
        super(editor, id, icon, name, description, hotkey);
        this.isTempTool = true;
    }

    makeDivs() {
    }

    setActive() {
        if (this.active) {
            return;
        }
        this.active = true;
    }

    setInactive() {
        if (!this.active) {
            return;
        }
        this.active = false;
    }
}

/**
 * A middle-class for tools with color controls (color picker, swatch, eyedropper, mask/image color memory).
 */
class ImageEditorToolWithColor extends ImageEditorTool {
    constructor(editor, id, icon, name, description, defaultColor = '#ffffff', hotkey = null) {
        super(editor, id, icon, name, description, hotkey);
        this.color = defaultColor;
        this.imageColor = defaultColor;
        this.maskColor = '#ffffff';
    }

    getColorControlsHTML() {
        return `
        <div class="image-editor-tool-block tool-block-nogrow">
            <label>Color:&nbsp;</label>
            <input type="text" class="auto-number id-col1" style="width:75px;flex-grow:0;" value="${this.color}">
            <div class="color-picker-swatch-inline id-col2" style="background-color:${this.color};" title="Open color picker"></div>
            <button class="basic-button color-picker-eyedrop-button id-col3" title="Pick color from canvas"></button>
        </div>`;
    }

    wireColorControls() {
        this.colorText = this.configDiv.querySelector('.id-col1');
        this.colorSelector = this.configDiv.querySelector('.id-col2');
        this.colorPickButton = this.configDiv.querySelector('.id-col3');
        this.colorText.readOnly = true;
        this.colorText.style.cursor = 'pointer';
        this.colorBlock = this.colorText.closest('.image-editor-tool-block');
        let openPickerForThis = (focusHex) => {
            if (colorPickerHelper.isOpen && colorPickerHelper.anchorElement == this.colorBlock) {
                colorPickerHelper.close();
            }
            else {
                let isMask = this.editor.activeLayer && this.editor.activeLayer.isMask;
                colorPickerHelper.open(this.colorBlock, this.color, (newColor) => {
                    this.colorText.value = newColor;
                    this.colorSelector.style.backgroundColor = newColor;
                    this.onConfigChange();
                }, isMask);
                if (focusHex) {
                    colorPickerHelper.focusHex();
                }
            }
        };
        this.colorText.addEventListener('click', () => {
            openPickerForThis(true);
        });
        this.colorSelector.addEventListener('click', () => {
            openPickerForThis(false);
        });
        this.colorPickButton.addEventListener('click', () => {
            if (this.colorPickButton.classList.contains('interrupt-button')) {
                this.colorPickButton.classList.remove('interrupt-button');
                this.editor.activateTool(this.id);
            }
            else {
                this.colorPickButton.classList.add('interrupt-button');
                this.editor.pickerTool.toolFor = this;
                this.editor.activateTool('picker');
            }
        });
    }

    setColor(col) {
        this.color = col;
        this.colorText.value = col;
        this.colorSelector.style.backgroundColor = col;
        this.colorPickButton.classList.remove('interrupt-button');
    }

    onLayerChanged(oldLayer, newLayer) {
        super.onLayerChanged(oldLayer, newLayer);
        if (!this.colorText) {
            return;
        }
        let wasMask = oldLayer && oldLayer.isMask;
        let isMask = newLayer && newLayer.isMask;
        if (wasMask) {
            this.maskColor = this.color;
        }
        else {
            this.imageColor = this.color;
        }
        if (isMask) {
            this.setColor(colorPickerHelper.hexToGrayscale(this.maskColor));
        }
        else {
            this.setColor(this.imageColor);
        }
    }
}

/**
 * The special extra options tool.
 */
class ImageEditorToolOptions extends ImageEditorTool {
    constructor(editor) {
        super(editor, 'options', 'dotdotdot', 'Options', 'Additional advanced options for the image editor.');
        this.optionButtons = [
            { key: 'Download Current Image', action: () => {
                let link = document.createElement('a');
                link.href = this.editor.getFinalImageData();
                link.download = 'image.png';
                link.click();
            }},
            { key: 'Download Full Canvas', action: () => {
                let link = document.createElement('a');
                link.href = this.editor.getMaximumImageData();
                link.download = 'canvas.png';
                link.click();
            }},
            { key: 'Download Mask', action: () => {
                let link = document.createElement('a');
                link.href = this.editor.getFinalMaskData();
                link.download = 'mask.png';
                link.click();
            }},
            { key: 'Copy Selection (Final Image)', action: () => {
                this.editor.copySelectionToClipboard(false);
            }},
            { key: 'Copy Selection (Current Layer)', action: () => {
                this.editor.copySelectionToClipboard(true);
            }},
        ];
    }

    onClick() {
        let rect = this.div.getBoundingClientRect();
        new AdvancedPopover('imageeditor_options_popover', this.optionButtons, false, rect.x, rect.y + this.div.offsetHeight + 6, document.body, null, null, 999999, false);
    }
}

/**
 * The generic common tool (can be activated freely with the Alt key).
 */
class ImageEditorToolGeneral extends ImageEditorTool {
    constructor(editor) {
        super(editor, 'general', 'mouse', 'General', 'General tool. Lets you move around the canvas, or adjust size of current layer.\nWhile resizing an object, hold CTRL to snap-to-grid, or hold SHIFT to disable aspect preservation.\nThe general tool can be activated at any time with the Alt key.\nHotKey: G', 'g');
        this.currentDragCircle = null;
        this.rotateIcon = new Image();
        this.rotateIcon.src = 'imgs/canvas_rotate.png';
        this.moveIcon = new Image();
        this.moveIcon.src = 'imgs/canvas_move.png';
    }

    fixCursor() {
        this.cursor = this.editor.mouseDown ? 'grabbing' : 'crosshair';
    }

    activeLayerControlCircles() {
        let [offsetX, offsetY] = this.editor.imageCoordToCanvasCoord(this.editor.activeLayer.offsetX, this.editor.activeLayer.offsetY);
        let [width, height] = [this.editor.activeLayer.width * this.editor.zoomLevel, this.editor.activeLayer.height * this.editor.zoomLevel];
        let circles = [];
        let radius = 4;
        circles.push({name: 'top-left', radius: radius, x: offsetX - radius / 2, y: offsetY - radius / 2});
        circles.push({name: 'top-right', radius: radius, x: offsetX + width + radius / 2, y: offsetY - radius / 2});
        circles.push({name: 'bottom-left', radius: radius, x: offsetX - radius / 2, y: offsetY + height + radius / 2});
        circles.push({name: 'bottom-right', radius: radius, x: offsetX + width + radius / 2, y: offsetY + height + radius / 2});
        circles.push({name: 'center-top', radius: radius, x: offsetX + width / 2, y: offsetY - radius / 2});
        circles.push({name: 'center-bottom', radius: radius, x: offsetX + width / 2, y: offsetY + height + radius / 2});
        circles.push({name: 'center-left', radius: radius, x: offsetX - radius / 2, y: offsetY + height / 2});
        circles.push({name: 'center-right', radius: radius, x: offsetX + width + radius / 2, y: offsetY + height / 2});
        circles.push({name: 'positioner', radius: radius * 2, x: offsetX + width / 2, y: offsetY - radius * 8, icon: this.moveIcon});
        circles.push({name: 'rotator', radius: radius * 2, x: offsetX + width / 2, y: offsetY - radius * 16, icon: this.rotateIcon});
        let angle = this.editor.activeLayer.rotation;
        if (angle != 0) {
            for (let circle of circles) {
                circle.x = Math.round(circle.x);
                circle.y = Math.round(circle.y);
                let [cx, cy] = [offsetX + width / 2, offsetY + height / 2];
                let [x, y] = [circle.x - cx, circle.y - cy];
                [x, y] = [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
                [circle.x, circle.y] = [x + cx, y + cy];
            }
        }
        return circles;
    }

    getControlCircle(name) {
        return this.activeLayerControlCircles().find(c => c.name == name);
    }

    draw() {
        this.fixCursor();
        for (let circle of this.activeLayerControlCircles()) {
            this.editor.ctx.strokeStyle = '#ffffff';
            this.editor.ctx.fillStyle = '#000000';
            if (this.editor.isMouseInCircle(circle.x, circle.y, circle.radius)) {
                this.editor.canvas.style.cursor = 'grab';
                this.editor.ctx.strokeStyle = '#000000';
                this.editor.ctx.fillStyle = '#ffffff';
            }
            this.editor.ctx.lineWidth = 1;
            if (circle.icon) {
                this.editor.ctx.save();
                this.editor.ctx.filter = 'invert(1)';
                for (let offset of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    this.editor.ctx.drawImage(circle.icon, circle.x - circle.radius + offset[0], circle.y - circle.radius + offset[1], circle.radius * 2, circle.radius * 2);
                }
                this.editor.ctx.restore();
                this.editor.ctx.drawImage(circle.icon, circle.x - circle.radius, circle.y - circle.radius, circle.radius * 2, circle.radius * 2);
            }
            else {
                this.editor.ctx.beginPath();
                this.editor.ctx.arc(circle.x, circle.y, circle.radius, 0, 2 * Math.PI);
                this.editor.ctx.fill();
                this.editor.ctx.stroke();
            }
        }
    }

    onMouseDown(e) {
        this.fixCursor();
        this.currentDragCircle = null;
        for (let circle of this.activeLayerControlCircles()) {
            if (this.editor.isMouseInCircle(circle.x, circle.y, circle.radius)) {
                this.editor.activeLayer.savePositions();
                this.currentDragCircle = circle.name;
                break;
            }
        }
    }

    onMouseUp(e) {
        this.fixCursor();
        this.currentDragCircle = null;
    }

    onGlobalMouseMove(e) {
        if (this.editor.mouseDown) {
            let dx = (this.editor.mouseX - this.editor.lastMouseX) / this.editor.zoomLevel;
            let dy = (this.editor.mouseY - this.editor.lastMouseY) / this.editor.zoomLevel;
            let target = this.editor.activeLayer;
            let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
            if (this.currentDragCircle == 'rotator') {
                let centerX = target.offsetX + target.width / 2;
                let centerY = target.offsetY + target.height / 2;
                target.rotation = Math.atan2(mouseY - centerY, mouseX - centerX) + Math.PI / 2;
                if (e.ctrlKey) {
                    target.rotation = Math.round(target.rotation / (Math.PI / 16)) * (Math.PI / 16);
                }
                this.editor.markChanged();
            }
            else if (this.currentDragCircle) {
                let current = this.getControlCircle(this.currentDragCircle);
                let [circleX, circleY] = this.editor.canvasCoordToImageCoord(current.x, current.y);
                let roundFactor = 1;
                if (e.ctrlKey) {
                    roundFactor = 8;
                    while (roundFactor * this.editor.zoomLevel < 16) {
                        roundFactor *= 4;
                    }
                }
                function applyRotate(x, y, angle = null) {
                    let [cx, cy] = [target.offsetX + target.width / 2, target.offsetY + target.height / 2];
                    if (angle == null) {
                        angle = target.rotation;
                    }
                    [x, y] = [x - cx, y - cy];
                    [x, y] = [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
                    [x, y] = [x + cx, y + cy];
                    return [x, y];
                }
                if (!e.shiftKey && !current.name.startsWith('center') && current.name != 'positioner') {
                    let [cX, cY] = [target.offsetX + target.width / 2, target.offsetY + target.height / 2];
                    let [dirX, dirY] = [circleX - cX, circleY - cY];
                    let lineLen = Math.sqrt(dirX * dirX + dirY * dirY);
                    [dirX, dirY] = [dirX / lineLen, dirY / lineLen];
                    let [vX, vY] = [mouseX - cX, mouseY - cY];
                    let d = vX * dirX + vY * dirY;
                    [mouseX, mouseY] = [cX + dirX * d, cY + dirY * d];
                }
                let dx = Math.round(mouseX / roundFactor) * roundFactor - circleX;
                let dy = Math.round(mouseY / roundFactor) * roundFactor - circleY;
                if (current.name == 'positioner') {
                    target.offsetX += dx;
                    target.offsetY += dy;
                }
                else {
                    [dx, dy] = [dx * Math.cos(-target.rotation) - dy * Math.sin(-target.rotation), dx * Math.sin(-target.rotation) + dy * Math.cos(-target.rotation)];
                    let [origX, origY] = [target.offsetX, target.offsetY];
                    let [origWidth, origHeight] = [target.width, target.height];
                    let handleDef = {
                        'top-left': [true, false, true, false],
                        'top-right': [false, true, true, false],
                        'bottom-left': [true, false, false, true],
                        'bottom-right': [false, true, false, true],
                        'center-top': [false, false, true, false],
                        'center-bottom': [false, false, false, true],
                        'center-left': [true, false, false, false],
                        'center-right': [false, true, false, false],
                    }[current.name];
                    if (handleDef) {
                        let [moveLeft, moveRight, moveTop, moveBottom] = handleDef;
                        let anchorXFrac = moveLeft ? 1 : (moveRight ? 0 : 0.5);
                        let anchorYFrac = moveTop ? 1 : (moveBottom ? 0 : 0.5);
                        let [origAnchorX, origAnchorY] = applyRotate(origX + anchorXFrac * origWidth, origY + anchorYFrac * origHeight);
                        if (moveLeft) {
                            let wc = Math.min(dx, target.width - 1);
                            target.offsetX += wc;
                            target.width -= wc;
                        }
                        else if (moveRight) {
                            target.width += Math.max(dx, 1 - target.width);
                        }
                        if (moveTop) {
                            let hc = Math.min(dy, target.height - 1);
                            target.offsetY += hc;
                            target.height -= hc;
                        }
                        else if (moveBottom) {
                            target.height += Math.max(dy, 1 - target.height);
                        }
                        let [newAnchorX, newAnchorY] = applyRotate(target.offsetX + anchorXFrac * target.width, target.offsetY + anchorYFrac * target.height);
                        target.offsetX += origAnchorX - newAnchorX;
                        target.offsetY += origAnchorY - newAnchorY;
                    }
                }
                this.editor.markChanged();
            }
            else {
                this.editor.offsetX += dx;
                this.editor.offsetY += dy;
            }
            return true;
        }
        return false;
    }
}

/**
 * The layer-move tool.
 */
class ImageEditorToolMove extends ImageEditorTool {
    constructor(editor) {
        super(editor, 'move', 'move', 'Move', 'Free-move the current layer.\nHold SHIFT to lock to flat directions (45/90 degree movements only).\nHold CTRL to snap to grid (32px).\nHotKey: M', 'm');
        this.startingX = null;
        this.startingY = null;
    }

    onMouseDown(e) {
        this.startingX = this.editor.activeLayer.offsetX;
        this.startingY = this.editor.activeLayer.offsetY;
        this.moveX = 0;
        this.moveY = 0;
        this.editor.activeLayer.savePositions();
    }

    onGlobalMouseMove(e) {
        if (this.editor.mouseDown && this.startingX != null) {
            this.moveX += (this.editor.mouseX - this.editor.lastMouseX) / this.editor.zoomLevel;
            this.moveY += (this.editor.mouseY - this.editor.lastMouseY) / this.editor.zoomLevel;
            let actualX = this.moveX, actualY = this.moveY;
            if (e.shiftKey) {
                let absX = Math.abs(actualX), absY = Math.abs(actualY);
                if (absX > absY * 2) {
                    actualY = 0;
                }
                else if (absY > absX * 2) {
                    actualX = 0;
                }
                else {
                    let dist = Math.sqrt(actualX * actualX + actualY * actualY);
                    actualX = dist * Math.sign(actualX);
                    actualY = dist * Math.sign(actualY);
                }
            }
            let layer = this.editor.activeLayer;
            layer.offsetX = this.startingX + actualX;
            layer.offsetY = this.startingY + actualY;
            if (e.ctrlKey) {
                layer.offsetX = Math.round(layer.offsetX / 32) * 32;
                layer.offsetY = Math.round(layer.offsetY / 32) * 32;
            }
            this.editor.markChanged();
            return true;
        }
        return false;
    }

    onGlobalMouseUp(e) {
        this.startingX = null;
        this.startingY = null;
        return false;
    }
}

/**
 * The selection tool.
 */
class ImageEditorToolSelect extends ImageEditorTool {
    constructor(editor) {
        super(editor, 'select', 'select', 'Select', 'Select a region of the image.\nHotKey: S', 's');
        this.copyMode = 'final';
        let copyDropdown = `<div class="image-editor-tool-block">
            <label>Copy:&nbsp;</label>
            <select class="id-copy-mode" style="width:120px;">
                <option value="final">Final Image</option>
                <option value="layer">Current Layer</option>
            </select>
        </div>`;
        let makeRegionButton = `<div class="image-editor-tool-block">
            <button class="basic-button id-make-region">Make Region</button>
        </div>`;
        this.configDiv.innerHTML = copyDropdown + makeRegionButton;
        this.copyModeSelect = this.configDiv.querySelector('.id-copy-mode');
        this.copyModeSelect.addEventListener('change', () => {
            this.copyMode = this.copyModeSelect.value;
        });
        this.configDiv.querySelector('.id-make-region').addEventListener('click', () => {
            if (this.editor.hasSelection) {
                // TODO: This should create a new pseudo-layer that highlights a simple box and render the region text inside of it
                let promptBox = getRequiredElementById('alt_prompt_textbox');
                function roundClean(v) {
                    return Math.round(v * 1000) / 1000;
                }
                let regionText = `\n<region:${roundClean(this.editor.selectX / this.editor.realWidth)},${roundClean(this.editor.selectY / this.editor.realHeight)},${roundClean(this.editor.selectWidth / this.editor.realWidth)},${roundClean(this.editor.selectHeight / this.editor.realHeight)}>`;
                promptBox.value += regionText;
                triggerChangeFor(promptBox);
            }
        });
    }

    onMouseDown(e) {
        let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
        this.editor.selectX = mouseX;
        this.editor.selectY = mouseY;
        this.editor.hasSelection = false;
    }

    onMouseUp(e) {
        if (this.editor.hasSelection) {
            if (this.editor.selectWidth < 0) {
                this.editor.selectX += this.editor.selectWidth;
                this.editor.selectWidth = -this.editor.selectWidth;
            }
            if (this.editor.selectHeight < 0) {
                this.editor.selectY += this.editor.selectHeight;
                this.editor.selectHeight = -this.editor.selectHeight;
            }
        }
    }

    onGlobalMouseMove(e) {
        if (this.editor.mouseDown) {
            let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
            this.editor.selectWidth = mouseX - this.editor.selectX;
            this.editor.selectHeight = mouseY - this.editor.selectY;
            this.editor.hasSelection = true;
            this.editor.markChanged();
            return true;
        }
        return false;
    }
}

/**
 * The Paintbrush tool (also the base used for other brush-likes, such as the Eraser).
 */
class ImageEditorToolBrush extends ImageEditorToolWithColor {
    constructor(editor, id, icon, name, description, isEraser, hotkey = null) {
        super(editor, id, icon, name, description, '#ffffff', hotkey);
        this.cursor = 'none';
        this.radius = 10;
        this.opacity = 1;
        this.brushing = false;
        this.isEraser = isEraser;
        let radiusHtml = `<div class="image-editor-tool-block id-rad-block">
                <label>Radius:&nbsp;</label>
                <input type="number" style="width: 40px;" class="auto-number id-rad1" min="1" max="1024" step="1" value="10">
                <div class="auto-slider-range-wrapper" style="${getRangeStyle(10, 1, 1024)}">
                    <input type="range" style="flex-grow: 2" data-ispot="true" class="auto-slider-range id-rad2" min="1" max="1024" step="1" value="10" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
                </div>
            </div>`;
        let opacityHtml = `<div class="image-editor-tool-block id-opac-block">
                <label>Opacity:&nbsp;</label>
                <input type="number" style="width: 40px;" class="auto-number id-opac1" min="1" max="100" step="1" value="100">
                <div class="auto-slider-range-wrapper" style="${getRangeStyle(100, 1, 100)}">
                    <input type="range" style="flex-grow: 2" class="auto-slider-range id-opac2" min="1" max="100" step="1" value="100" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
                </div>
            </div>`;
        if (isEraser) {
            this.configDiv.innerHTML = radiusHtml + opacityHtml;
        }
        else {
            this.configDiv.innerHTML = this.getColorControlsHTML() + radiusHtml + opacityHtml;
            this.wireColorControls();
        }
        enableSliderForBox(this.configDiv.querySelector('.id-rad-block'));
        enableSliderForBox(this.configDiv.querySelector('.id-opac-block'));
        this.radiusNumber = this.configDiv.querySelector('.id-rad1');
        this.radiusSelector = this.configDiv.querySelector('.id-rad2');
        this.opacityNumber = this.configDiv.querySelector('.id-opac1');
        this.opacitySelector = this.configDiv.querySelector('.id-opac2');
        this.radiusNumber.addEventListener('change', () => { this.onConfigChange(); });
        this.opacityNumber.addEventListener('change', () => { this.onConfigChange(); });
        this.lastTouch = null;
    }

    onConfigChange() {
        if (!this.isEraser) {
            this.color = this.colorText.value;
        }
        this.radius = parseInt(this.radiusNumber.value);
        this.opacity = parseInt(this.opacityNumber.value) / 100;
        this.editor.redraw();
    }

    draw() {
        this.drawCircleBrush(this.editor.mouseX, this.editor.mouseY, this.radius * this.editor.zoomLevel);
    }

    brush(force = 1) {
        let [lastX, lastY] = this.editor.activeLayer.canvasCoordToLayerCoord(this.editor.lastMouseX, this.editor.lastMouseY);
        let [x, y] = this.editor.activeLayer.canvasCoordToLayerCoord(this.editor.mouseX, this.editor.mouseY);
        this.bufferLayer.drawFilledCircle(lastX, lastY, this.radius * force, this.color);
        this.bufferLayer.drawFilledCircleStrokeBetween(lastX, lastY, x, y, this.radius * force, this.color);
        this.bufferLayer.drawFilledCircle(x, y, this.radius * force, this.color);
        this.editor.markChanged();
    }

    getForceFrom(e) {
        if (e.touches && e.touches.length > 0) {
            let touch = e.touches.item(0);
            this.lastTouch = Date.now();
            if (touch.force <= 0) {
                return 1;
            }
            return touch.force;
        }
        return 1;
    }

    onMouseDown(e) {
        if (this.brushing) {
            return;
        }
        if (e.touches) {
            this.lastTouch = Date.now();
        }
        if (!e.touches && this.lastTouch && Date.now() - this.lastTouch < 1000) {
            return;
        }
        this.brushing = true;
        let target = this.editor.activeLayer;
        this.bufferLayer = new ImageEditorLayer(this.editor, target.canvas.width, target.canvas.height, target);
        this.bufferLayer.opacity = this.opacity;
        if (this.isEraser) {
            this.bufferLayer.globalCompositeOperation = 'destination-out';
        }
        this.applySelectionClip(this.bufferLayer.ctx, target);
        target.childLayers.push(this.bufferLayer);
        this.brush(this.getForceFrom(e));
    }

    onMouseMove(e) {
        if (this.brushing) {
            if (e.touches) {
                this.lastTouch = Date.now();
            }
            if (!e.touches && this.lastTouch && Date.now() - this.lastTouch < 1000) {
                return;
            }
            this.brush(this.getForceFrom(e));
        }
    }

    onMouseWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            let newRadius = parseInt(this.radius * Math.pow(1.1, -e.deltaY / 100));
            if (newRadius == this.radius) {
                newRadius += e.deltaY > 0 ? -1 : 1;
            }
            this.radiusNumber.value = Math.max(1, Math.min(1024, newRadius));
            this.radiusNumber.dispatchEvent(new Event('input'));
            this.radiusNumber.dispatchEvent(new Event('change'));
        }
    }

    onGlobalMouseUp(e) {
        if (this.brushing) {
            this.editor.activeLayer.childLayers.pop();
            let offset = this.editor.activeLayer.getOffset();
            this.editor.activeLayer.saveBeforeEdit();
            this.bufferLayer.drawToBackDirect(this.editor.activeLayer.ctx, -offset[0], -offset[1], 1);
            this.editor.activeLayer.hasAnyContent = true;
            this.bufferLayer = null;
            this.brushing = false;
            return true;
        }
        return false;
    }
}


/**
 * The Paint Bucket tool.
 */
class ImageEditorToolBucket extends ImageEditorToolWithColor {
    constructor(editor) {
        super(editor, 'paintbucket', 'paintbucket', 'Paint Bucket', 'Fill an area with a color.\nHotKey: P', '#ffffff', 'p');
        this.cursor = 'crosshair';
        this.threshold = 10;
        this.opacity = 1;
        let thresholdHtml = `<div class="image-editor-tool-block id-thresh-block">
                <label>Threshold:&nbsp;</label>
                <input type="number" style="width: 40px;" class="auto-number id-thresh1" min="1" max="256" step="1" value="10">
                <div class="auto-slider-range-wrapper" style="${getRangeStyle(10, 1, 256)}">
                    <input type="range" style="flex-grow: 2" data-ispot="true" class="auto-slider-range id-thresh2" min="1" max="256" step="1" value="10" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
                </div>
            </div>`;
        this.configDiv.innerHTML = this.getColorControlsHTML() + thresholdHtml;
        this.wireColorControls();
        enableSliderForBox(this.configDiv.querySelector('.id-thresh-block'));
        this.thresholdNumber = this.configDiv.querySelector('.id-thresh1');
        this.thresholdSelector = this.configDiv.querySelector('.id-thresh2');
        this.thresholdNumber.addEventListener('change', () => { this.onConfigChange(); });
        this.lastTouch = null;
    }

    onConfigChange() {
        this.color = this.colorText.value;
        this.threshold = parseInt(this.thresholdNumber.value);
        this.editor.redraw();
    }

    doBucket(x, y) {
        let layer = this.editor.activeLayer;
        let [targetX, targetY] = layer.canvasCoordToLayerCoord(x, y);
        targetX = Math.round(targetX);
        targetY = Math.round(targetY);
        if (targetX < 0 || targetY < 0 || targetX >= layer.width || targetY >= layer.height) {
            return;
        }
        let selBounds = this.getSelectionBoundsInLayer(layer);
        if (selBounds && (targetX < selBounds.minX || targetY < selBounds.minY || targetX >= selBounds.maxX || targetY >= selBounds.maxY)) {
            return;
        }
        layer.saveBeforeEdit();
        layer.hasAnyContent = true;
        let canvas = layer.canvas;
        let ctx = layer.ctx;
        let refImage = document.createElement('canvas');
        refImage.width = canvas.width;
        refImage.height = canvas.height;
        let refCtx = refImage.getContext('2d');
        for (let i = 0; i < this.editor.layers.length; i++) {
            let belowLayer = this.editor.layers[i];
            if (belowLayer.isMask) {
                continue;
            }
            let offset = layer.getOffset();
            belowLayer.drawToBack(refCtx, -offset[0], -offset[1], 1);
            if (belowLayer == layer) {
                break;
            }
        }
        let refData = refCtx.getImageData(0, 0, refImage.width, refImage.height);
        let refRawData = refData.data;
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let [width, height] = [imageData.width, imageData.height];
        let maskData = new Uint8Array(width * height);
        let rawData = imageData.data;
        let threshold = this.threshold;
        let newColor = [parseInt(this.color.substring(1, 3), 16), parseInt(this.color.substring(3, 5), 16), parseInt(this.color.substring(5, 7), 16)];
        let boundsMinX = selBounds ? selBounds.minX : 0;
        let boundsMinY = selBounds ? selBounds.minY : 0;
        let boundsMaxX = selBounds ? Math.min(selBounds.maxX, width) : width;
        let boundsMaxY = selBounds ? Math.min(selBounds.maxY, height) : height;
        function getPixelIndex(x, y) {
            return (y * width + x) * 4;
        }
        function getColorAt(x, y) {
            let index = getPixelIndex(x, y);
            return [refRawData[index], refRawData[index + 1], refRawData[index + 2], refRawData[index + 3]];
        }
        let startColor = getColorAt(targetX, targetY);
        function isInRange(targetColor) {
            return Math.abs(targetColor[0] - startColor[0]) + Math.abs(targetColor[1] - startColor[1]) + Math.abs(targetColor[2] - startColor[2]) + Math.abs(targetColor[3] - startColor[3]) <= threshold;
        }
        let hits = 0;
        function setPixel(x, y) {
            maskData[y * width + x] = 1;
            let index = getPixelIndex(x, y);
            rawData[index] = newColor[0];
            rawData[index + 1] = newColor[1];
            rawData[index + 2] = newColor[2];
            rawData[index + 3] = 255;
            hits++;
        }
        function canInclude(x, y) {
            return x >= boundsMinX && y >= boundsMinY && x < boundsMaxX && y < boundsMaxY && maskData[y * width + x] == 0 && isInRange(getColorAt(x, y));
        }
        let stack = [[targetX, targetY]];
        while (stack.length > 0) {
            let [x, y] = stack.pop();
            if (!canInclude(x, y)) {
                continue;
            }
            setPixel(x, y);
            if (canInclude(x - 1, y)) { stack.push([x - 1, y]); }
            if (canInclude(x + 1, y)) { stack.push([x + 1, y]); }
            if (canInclude(x, y - 1)) { stack.push([x, y - 1]); }
            if (canInclude(x, y + 1)) { stack.push([x, y + 1]); }
        }
        ctx.putImageData(imageData, 0, 0);
        this.editor.markChanged();
    }

    onMouseDown(e) {
        this.doBucket(this.editor.mouseX, this.editor.mouseY);
    }
}

/**
 * The Shape tool.
 */
class ImageEditorToolShape extends ImageEditorToolWithColor {
    constructor(editor) {
        super(editor, 'shape', 'shape', 'Shape', 'Create basic colored shape outlines.\nClick and drag to draw a shape.\nHotKey: X', '#ff0000', 'x');
        this.cursor = 'crosshair';
        this.strokeWidth = 4;
        this.shape = 'rectangle';
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.startLayerX = 0;
        this.startLayerY = 0;
        this.currentLayerX = 0;
        this.currentLayerY = 0;
        this.bufferLayer = null;
        this.hasDrawn = false;
        this.fill = false;
        let shapeHTML = `
        <div class="image-editor-tool-block tool-block-nogrow">
            <label>Shape:&nbsp;</label>
            <select class="id-shape" style="width:100px;">
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
            </select>
        </div>`;
        let fillHTML = `
        <div class="image-editor-tool-block tool-block-nogrow">
            <label><input type="checkbox" class="id-fill"> Fill</label>
        </div>`;
        let strokeHTML = `
        <div class="image-editor-tool-block id-stroke-block">
            <label>Width:&nbsp;</label>
            <input type="number" style="width: 40px;" class="auto-number id-stroke1" min="1" max="20" step="1" value="4">
            <div class="auto-slider-range-wrapper" style="${getRangeStyle(4, 1, 20)}">
                <input type="range" style="flex-grow: 2" class="auto-slider-range id-stroke2" min="1" max="20" step="1" value="4" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
            </div>
        </div>`;
        this.configDiv.innerHTML = this.getColorControlsHTML() + shapeHTML + fillHTML + strokeHTML;
        this.wireColorControls();
        this.shapeSelect = this.configDiv.querySelector('.id-shape');
        this.fillCheckbox = this.configDiv.querySelector('.id-fill');
        this.strokeNumber = this.configDiv.querySelector('.id-stroke1');
        this.strokeSelector = this.configDiv.querySelector('.id-stroke2');
        this.shapeSelect.addEventListener('change', () => {
            this.shape = this.shapeSelect.value;
            this.editor.redraw();
        });
        this.fillCheckbox.addEventListener('change', () => {
            this.fill = this.fillCheckbox.checked;
            this.updateStrokeDisabled();
            this.editor.redraw();
        });
        this.strokeBlock = this.configDiv.querySelector('.id-stroke-block');
        enableSliderForBox(this.strokeBlock);
        this.strokeNumber.addEventListener('change', () => { this.onConfigChange(); });
    }
    
    onConfigChange() {
        this.color = this.colorText.value;
        this.strokeWidth = parseInt(this.strokeNumber.value);
        this.editor.redraw();
    }

    updateStrokeDisabled() {
        this.strokeBlock.style.opacity = this.fill ? '0.5' : '';
        this.strokeBlock.style.pointerEvents = this.fill ? 'none' : '';
    }

    getEffectiveStrokeWidth() {
        return this.fill ? 1 : this.strokeWidth;
    }

    drawRectangleBorder(ctx, x, y, width, height, thickness) {
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));
        thickness = Math.max(1, Math.floor(thickness));
        thickness = Math.min(thickness, width, height);
        ctx.fillRect(x, y, width, thickness);
        ctx.fillRect(x, y + height - thickness, width, thickness);
        let verticalHeight = height - thickness * 2;
        if (verticalHeight > 0) {
            ctx.fillRect(x, y + thickness, thickness, verticalHeight);
            ctx.fillRect(x + width - thickness, y + thickness, thickness, verticalHeight);
        }
    }

    drawShapeToCanvas(ctx, type, x, y, width, height, fill = false) {
        ctx.beginPath();
        if (type == 'rectangle') {
            ctx.rect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
        }
        else if (type == 'circle') {
            let radius = Math.sqrt(width * width + height * height) / 2;
            ctx.arc(Math.round(x + width / 2), Math.round(y + height / 2), Math.round(radius), 0, 2 * Math.PI);
        }
        if (fill) {
            ctx.fill();
        }
        ctx.stroke();
    }

    draw() {
        if (!this.isDrawing) {
            return;
        }
        let target = this.editor.activeLayer;
        if (!target) {
            return;
        }
        let startX = Math.min(this.startLayerX, this.currentLayerX);
        let startY = Math.min(this.startLayerY, this.currentLayerY);
        let endX = Math.max(this.startLayerX, this.currentLayerX);
        let endY = Math.max(this.startLayerY, this.currentLayerY);
        let width = endX - startX;
        let height = endY - startY;
        if (width == 0 && height == 0) {
            return;
        }
        let [canvasX1, canvasY1] = target.layerCoordToCanvasCoord(startX, startY);
        let [canvasX2, canvasY2] = target.layerCoordToCanvasCoord(endX, endY);
        let [imageX1, imageY1] = target.editor.canvasCoordToImageCoord(canvasX1, canvasY1);
        let [imageX2, imageY2] = target.editor.canvasCoordToImageCoord(canvasX2, canvasY2);
        let canvasWidth = canvasX2 - canvasX1;
        let canvasHeight = canvasY2 - canvasY1;
        this.editor.ctx.save();
        if (this.editor.hasSelection) {
            let [selX1, selY1] = this.editor.imageCoordToCanvasCoord(this.editor.selectX, this.editor.selectY);
            let [selX2, selY2] = this.editor.imageCoordToCanvasCoord(this.editor.selectX + this.editor.selectWidth, this.editor.selectY + this.editor.selectHeight);
            this.editor.ctx.beginPath();
            this.editor.ctx.rect(selX1, selY1, selX2 - selX1, selY2 - selY1);
            this.editor.ctx.clip();
        }
        this.editor.ctx.imageSmoothingEnabled = false;
        this.editor.ctx.setLineDash([]);
        this.editor.ctx.fillStyle = this.color;
        if (this.shape == 'rectangle') {
            if (this.fill) {
                this.editor.ctx.fillRect(Math.round(canvasX1), Math.round(canvasY1), Math.round(canvasWidth), Math.round(canvasHeight));
            }
            else {
                let thickness = Math.max(1, Math.round(this.getEffectiveStrokeWidth() * this.editor.zoomLevel));
                this.drawRectangleBorder(this.editor.ctx, Math.round(canvasX1), Math.round(canvasY1), Math.round(canvasWidth), Math.round(canvasHeight), thickness);
            }
        }
        else {
            this.editor.ctx.strokeStyle = this.color;
            this.editor.ctx.lineWidth = Math.max(1, Math.round(this.getEffectiveStrokeWidth() * this.editor.zoomLevel));
            this.drawShapeToCanvas(this.editor.ctx, this.shape, canvasX1, canvasY1, canvasWidth, canvasHeight, this.fill);
        }
        this.editor.ctx.restore();
    }
    
    onMouseDown(e) {
        if (e.button != 0) {
            return;
        }
        if (this.isDrawing) {
            this.finishDrawing();
        }
        this.editor.updateMousePosFrom(e);
        let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
        mouseX = Math.round(mouseX);
        mouseY = Math.round(mouseY);
        this.isDrawing = true;
        this.startX = mouseX;
        this.startY = mouseY;
        this.currentX = mouseX;
        this.currentY = mouseY;
        this.hasDrawn = false;
        let target = this.editor.activeLayer;
        if (!target) {
            this.bufferLayer = null;
            this.isDrawing = false;
            return;
        }
        let [canvasX, canvasY] = target.editor.imageCoordToCanvasCoord(mouseX, mouseY);
        let [layerX, layerY] = target.canvasCoordToLayerCoord(canvasX, canvasY);
        layerX = Math.round(layerX);
        layerY = Math.round(layerY);
        this.startLayerX = layerX;
        this.startLayerY = layerY;
        this.currentLayerX = layerX;
        this.currentLayerY = layerY;
        this.bufferLayer = new ImageEditorLayer(this.editor, target.canvas.width, target.canvas.height, target);
        this.bufferLayer.opacity = 1;
        target.childLayers.push(this.bufferLayer);
    }
    
    finishDrawing() {
        if (this.isDrawing && this.bufferLayer) {
            let parent = this.editor.activeLayer;
            if (!parent) {
                this.bufferLayer = null;
                this.isDrawing = false;
                this.hasDrawn = false;
                this.editor.redraw();
                return;
            }
            if (!this.hasDrawn) {
                let idx = parent.childLayers.indexOf(this.bufferLayer);
                if (idx != -1) {
                    parent.childLayers.splice(idx, 1);
                }
                this.bufferLayer = null;
                this.isDrawing = false;
                this.hasDrawn = false;
                this.editor.redraw();
                return;
            }
            this.drawShape();
            let idx = parent.childLayers.indexOf(this.bufferLayer);
            if (idx != -1) {
                parent.childLayers.splice(idx, 1);
            }
            let offset = parent.getOffset();
            parent.saveBeforeEdit();
            this.bufferLayer.drawToBackDirect(parent.ctx, -offset[0], -offset[1], 1);
            parent.hasAnyContent = true;
            this.bufferLayer = null;
            this.isDrawing = false;
            this.hasDrawn = false;
            this.editor.markChanged();
            this.editor.redraw();
        }
    }
    
    updateCurrentShapePosition() {
        let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
        mouseX = Math.round(mouseX);
        mouseY = Math.round(mouseY);
        this.currentX = mouseX;
        this.currentY = mouseY;
        let target = this.editor.activeLayer;
        if (target) {
            let [canvasX, canvasY] = target.editor.imageCoordToCanvasCoord(mouseX, mouseY);
            let [layerX, layerY] = target.canvasCoordToLayerCoord(canvasX, canvasY);
            this.currentLayerX = Math.round(layerX);
            this.currentLayerY = Math.round(layerY);
        }
    }

    onMouseMove(e) {
        if (!this.isDrawing) {
            return;
        }
        this.updateCurrentShapePosition();
        this.drawShape();
    }

    onGlobalMouseMove(e) {
        if (!this.isDrawing) {
            return;
        }
        this.editor.updateMousePosFrom(e);
        this.updateCurrentShapePosition();
        this.drawShape();
    }

    onMouseUp(e) {
        if (e.button != 0 || !this.isDrawing) {
            return;
        }
        this.updateCurrentShapePosition();
        this.finishDrawing();
    }

    onGlobalMouseUp(e) {
        if (e.button != 0 || !this.isDrawing) {
            return;
        }
        this.updateCurrentShapePosition();
        this.finishDrawing();
    }

    drawShape() {
        if (!this.isDrawing || !this.bufferLayer) {
            return;
        }
        let parent = this.editor.activeLayer;
        if (!parent) {
            return;
        }
        this.bufferLayer.ctx.clearRect(0, 0, this.bufferLayer.canvas.width, this.bufferLayer.canvas.height);
        let startX = Math.round(Math.min(this.startLayerX, this.currentLayerX));
        let startY = Math.round(Math.min(this.startLayerY, this.currentLayerY));
        let endX = Math.round(Math.max(this.startLayerX, this.currentLayerX));
        let endY = Math.round(Math.max(this.startLayerY, this.currentLayerY));
        let width = endX - startX;
        let height = endY - startY;
        if (width == 0 && height == 0) {
            this.bufferLayer.hasAnyContent = false;
            this.hasDrawn = false;
            this.editor.redraw();
            return;
        }
        this.bufferLayer.ctx.save();
        this.applySelectionClip(this.bufferLayer.ctx, parent);
        this.bufferLayer.ctx.imageSmoothingEnabled = false;
        this.bufferLayer.ctx.setLineDash([]);
        this.bufferLayer.ctx.fillStyle = this.color;
        if (this.shape == 'rectangle') {
            if (this.fill) {
                this.bufferLayer.ctx.fillRect(startX, startY, width, height);
            }
            else {
                let thickness = Math.max(1, Math.round(this.getEffectiveStrokeWidth()));
                this.drawRectangleBorder(this.bufferLayer.ctx, startX, startY, width, height, thickness);
            }
        }
        else {
            this.bufferLayer.ctx.strokeStyle = this.color;
            this.bufferLayer.ctx.lineWidth = Math.max(1, Math.round(this.getEffectiveStrokeWidth()));
            this.drawShapeToCanvas(this.bufferLayer.ctx, this.shape, startX, startY, width, height, this.fill);
        }
        this.bufferLayer.ctx.restore();
        this.bufferLayer.hasAnyContent = true;
        this.hasDrawn = true;
        this.editor.markChanged();
        this.editor.redraw();
    }
}

/**
 * The Color Picker tool, a special hidden sub-tool.
 */
class ImageEditorToolPicker extends ImageEditorTempTool {
    constructor(editor, id, icon, name, description, hotkey = null) {
        super(editor, id, icon, name, description, hotkey);
        this.cursor = 'none';
        this.color = '#ffffff';
        this.picking = false;
        this.toolFor = null;
    }

    draw() {
        this.drawCircleBrush(this.editor.mouseX, this.editor.mouseY, 2);
    }

    pickNow() {
        let imageData = this.editor.ctx.getImageData(this.editor.mouseX, this.editor.mouseY, 1, 1).data;
        this.color = `#${imageData[0].toString(16).padStart(2, '0')}${imageData[1].toString(16).padStart(2, '0')}${imageData[2].toString(16).padStart(2, '0')}`;
        if (this.editor.activeLayer && this.editor.activeLayer.isMask) {
            this.color = colorPickerHelper.hexToGrayscale(this.color);
        }
        this.toolFor.setColor(this.color);
        this.editor.redraw();
    }

    onMouseDown(e) {
        if (this.picking || !this.toolFor) {
            return;
        }
        this.picking = true;
        this.pickNow();
    }

    onMouseMove(e) {
        if (this.picking) {
            this.pickNow();
        }
    }

    onGlobalMouseUp(e) {
        if (this.picking) {
            this.picking = false;
            this.toolFor.setColor(this.color);
            this.editor.activateTool(this.toolFor.id);
            return true;
        }
        return false;
    }
}

/**
 * Shared base class for SAM2-based mask tools (warmup, clear mask, request tracking).
 */
class ImageEditorToolSam2Base extends ImageEditorTool {
    constructor(editor, id, icon, name, description, hotkey = null) {
        super(editor, id, icon, name, description, hotkey);
        this.cursor = 'crosshair';
        this.requestSerial = 0;
        this.activeRequestId = 0;
        this.maskRequestInFlight = false;
        this.modelWarmed = false;
        this.isWarmingUp = false;
        this.controlsHTML = `
        <div class="image-editor-tool-block tool-block-nogrow">
            <button class="basic-button id-clear-mask">Clear Mask</button>
        </div>`;
        this.warmupHTML = `<div class="image-editor-tool-block tool-block-nogrow" style="opacity:0.8; font-style:italic;">Warming up SAM2 model...</div>`;
        this.showControls();
        this.isMaskOnly = true;
        this.div.style.display = 'none';
    }

    showControls() {
        this.configDiv.innerHTML = this.controlsHTML;
        this.configDiv.querySelector('.id-clear-mask').addEventListener('click', () => {
            this.onClearMask();
        });
    }

    onClearMask() {
        let maskLayer = this.editor.activeLayer;
        if (!maskLayer || !maskLayer.isMask) {
            return;
        }
        maskLayer.clearToEmpty();
        this.editor.redraw();
    }

    setActive() {
        super.setActive();
        if (!this.modelWarmed && !this.isWarmingUp && currentBackendFeatureSet.includes('sam2') && this.editor.getFinalImageData?.()) {
            this.triggerWarmup();
        }
    }

    addWarmupGenData(genData, cx, cy) {
    }

    triggerWarmup() {
        this.isWarmingUp = true;
        this.cursor = 'wait';
        this.editor.canvas.style.cursor = 'wait';
        this.configDiv.innerHTML = this.warmupHTML;
        try {
            let img = this.editor.getFinalImageData();
            let genData = getGenInput();
            genData['initimage'] = img;
            genData['images'] = 1;
            genData['prompt'] = '';
            delete genData['batchsize'];
            genData['donotsave'] = true;
            let cx = Math.floor((this.editor.realWidth || 64) / 2);
            let cy = Math.floor((this.editor.realHeight || 64) / 2);
            this.addWarmupGenData(genData, cx, cy);
            makeWSRequestT2I('GenerateText2ImageWS', genData, data => {
                if (data.image || data.error) {
                    this.finishWarmup();
                }
            });
        }
        catch (e) {
            this.finishWarmup();
        }
    }

    finishWarmup() {
        this.modelWarmed = true;
        this.isWarmingUp = false;
        this.cursor = 'crosshair';
        this.editor.canvas.style.cursor = 'crosshair';
        this.showControls();
    }

    /** Returns the image data and coordinate offset for SAM2 requests, cropped to the selection if active. */
    getImageForSam() {
        if (!this.editor.hasSelection) {
            return { image: this.editor.getFinalImageData(), offsetX: 0, offsetY: 0 };
        }
        let width = Math.round(this.editor.selectWidth);
        let height = Math.round(this.editor.selectHeight);
        let image = this.editor.getImageWithBounds(this.editor.selectX, this.editor.selectY, width, height);
        return { image: image, offsetX: this.editor.selectX, offsetY: this.editor.selectY, width: width, height: height };
    }

    /** Returns the general mask request inputs for SAM2 requests, cropped to the selection if active. */
    getGeneralMaskRequestInputs() {
        let samInput = this.getImageForSam();
        let genData = getGenInput();
        genData['initimage'] = samInput.image;
        genData['images'] = 1;
        genData['prompt'] = '';
        genData['width'] = samInput.width;
        genData['height'] = samInput.height;
        delete genData['rawresolution'];
        delete genData['sidelength'];
        delete genData['batchsize'];
        genData['donotsave'] = true;
        return [genData, samInput];
    }

    /** Applies a SAM2 mask result image to the active mask layer, handling selection cropping if active. */
    applyMaskResult(maskImg) {
        if (!this.editor.activeLayer || !this.editor.activeLayer.isMask) {
            return;
        }
        if (!this.editor.hasSelection) {
            this.editor.activeLayer.applyMaskFromImage(maskImg);
        }
        else {
            let selX = Math.round(this.editor.selectX);
            let selY = Math.round(this.editor.selectY);
            let selW = Math.round(this.editor.selectWidth);
            let selH = Math.round(this.editor.selectHeight);
            let fullMask = document.createElement('canvas');
            fullMask.width = this.editor.realWidth;
            fullMask.height = this.editor.realHeight;
            let fullCtx = fullMask.getContext('2d');
            fullCtx.drawImage(maskImg, 0, 0, maskImg.width || selW, maskImg.height || selH, selX, selY, selW, selH);
            this.editor.activeLayer.applyMaskFromImage(fullMask);
        }
        this.clipMaskToSelection();
    }

    /** Erases any mask pixels outside the current selection. No-op if no selection is active. */
    clipMaskToSelection() {
        let maskLayer = this.editor.activeLayer;
        if (!maskLayer || !maskLayer.isMask) {
            return;
        }
        let bounds = this.getSelectionBoundsInLayer(maskLayer);
        if (!bounds) {
            return;
        }
        maskLayer.ctx.save();
        maskLayer.ctx.globalCompositeOperation = 'destination-in';
        maskLayer.ctx.fillStyle = '#ffffff';
        maskLayer.ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        maskLayer.ctx.restore();
    }
}

/**
 * The SAM2 Point Segmentation tool - click to place positive/negative points and auto-generate a mask.
 */
class ImageEditorToolSam2Points extends ImageEditorToolSam2Base {
    constructor(editor) {
        super(editor, 'sam2points', 'crosshair', 'SAM2 Points', 'Left click to add positive points. Right click to add negative points.\nEach click regenerates the mask.\nRequires SAM2 to be installed.\nHotKey: Y', 'y');
        this.layerPoints = new Map();
        this.pendingMaskUpdate = false;
    }

    getActivePoints() {
        let layer = this.editor.activeLayer;
        if (!layer || !layer.isMask) {
            return { positive: [], negative: [] };
        }
        if (!this.layerPoints.has(layer.id)) {
            this.layerPoints.set(layer.id, { positive: [], negative: [] });
        }
        return this.layerPoints.get(layer.id);
    }

    clearMaskAndEndRequest() {
        let maskLayer = this.editor.activeLayer;
        if (maskLayer && maskLayer.isMask) {
            maskLayer.clearToEmpty();
        }
        this.activeRequestId = ++this.requestSerial;
        this.maskRequestInFlight = false;
        this.pendingMaskUpdate = false;
        this.editor.redraw();
    }

    onClearMask() {
        let maskLayer = this.editor.activeLayer;
        if (!maskLayer || !maskLayer.isMask) {
            return;
        }
        let points = this.getActivePoints();
        points.positive = [];
        points.negative = [];
        this.clearMaskAndEndRequest();
    }

    drawPoint(ctx, x, y, fillColor, showX) {
        let [cx, cy] = this.editor.imageCoordToCanvasCoord(x, y);
        let radius = Math.max(3, Math.round(4 * this.editor.zoomLevel));
        ctx.save();
        ctx.lineWidth = Math.max(1, Math.round(2 * this.editor.zoomLevel));
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        if (showX) {
            let cross = Math.max(3, Math.round(radius * 0.9));
            ctx.beginPath();
            ctx.moveTo(cx - cross, cy - cross);
            ctx.lineTo(cx + cross, cy + cross);
            ctx.moveTo(cx - cross, cy + cross);
            ctx.lineTo(cx + cross, cy - cross);
            ctx.stroke();
        }
        ctx.restore();
    }

    draw() {
        let ctx = this.editor.ctx;
        let points = this.getActivePoints();
        for (let point of points.positive) {
            this.drawPoint(ctx, point.x, point.y, '#33ff99', false);
        }
        for (let point of points.negative) {
            this.drawPoint(ctx, point.x, point.y, '#ff3355', true);
        }
    }

    onContextMenu(e) {
        e.preventDefault();
        return true;
    }

    addWarmupGenData(genData, cx, cy) {
        genData['sampositivepoints'] = JSON.stringify([{ x: cx, y: cy }]);
    }

    onMouseDown(e) {
        if (this.isWarmingUp || (e.button != 0 && e.button != 2)) {
            return;
        }
        this.editor.updateMousePosFrom(e);
        let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
        mouseX = Math.round(mouseX);
        mouseY = Math.round(mouseY);
        if (mouseX < 0 || mouseY < 0 || mouseX >= this.editor.realWidth || mouseY >= this.editor.realHeight) {
            return;
        }
        if (this.editor.hasSelection) {
            if (mouseX < this.editor.selectX || mouseY < this.editor.selectY
                || mouseX >= this.editor.selectX + this.editor.selectWidth
                || mouseY >= this.editor.selectY + this.editor.selectHeight) {
                return;
            }
        }
        let points = this.getActivePoints();
        let oppositeList = e.button == 2 ? points.positive : points.negative;
        let canvasMouseX = this.editor.mouseX;
        let canvasMouseY = this.editor.mouseY;
        let nearIndex = oppositeList.findIndex(p => {
            let [cx, cy] = this.editor.imageCoordToCanvasCoord(p.x, p.y);
            return (cx - canvasMouseX) ** 2 + (cy - canvasMouseY) ** 2 < 100;
        });
        if (nearIndex >= 0) {
            e.preventDefault();
            oppositeList.splice(nearIndex, 1);
            if (points.positive.length == 0) {
                this.clearMaskAndEndRequest();
            }
            else {
                this.queueMaskUpdate();
            }
            return;
        }
        let point = { x: mouseX, y: mouseY };
        if (e.button == 2) {
            e.preventDefault();
            points.negative.push(point);
        }
        else {
            points.positive.push(point);
        }
        this.queueMaskUpdate();
        this.editor.redraw();
    }

    queueMaskUpdate() {
        if (!currentBackendFeatureSet.includes('sam2')) {
            $('#sam2_installer').modal('show');
            return;
        }
        if (this.getActivePoints().positive.length == 0) {
            return;
        }
        if (this.maskRequestInFlight) {
            this.pendingMaskUpdate = true;
            return;
        }
        this.requestMaskUpdate();
    }

    finishMaskUpdate(requestId) {
        if (requestId != this.activeRequestId) {
            return;
        }
        this.maskRequestInFlight = false;
        if (this.pendingMaskUpdate) {
            this.pendingMaskUpdate = false;
            this.requestMaskUpdate();
        }
    }

    requestMaskUpdate() {
        this.maskRequestInFlight = true;
        let requestId = ++this.requestSerial;
        this.activeRequestId = requestId;
        let [genData, samInput] = this.getGeneralMaskRequestInputs();
        let points = this.getActivePoints();
        let offX = samInput.offsetX;
        let offY = samInput.offsetY;
        genData['sampositivepoints'] = JSON.stringify(points.positive.map(p => ({ x: p.x - offX, y: p.y - offY })));
        if (points.negative.length > 0) {
            genData['samnegativepoints'] = JSON.stringify(points.negative.map(p => ({ x: p.x - offX, y: p.y - offY })));
        }
        makeWSRequestT2I('GenerateText2ImageWS', genData, data => {
            if (requestId != this.activeRequestId || !data.image) {
                return;
            }
            let newImg = new Image();
            newImg.onload = () => {
                if (requestId != this.activeRequestId) {
                    return;
                }
                if (!this.editor.activeLayer || !this.editor.activeLayer.isMask) {
                    this.finishMaskUpdate(requestId);
                    return;
                }
                this.applyMaskResult(newImg);
                this.editor.redraw();
                this.finishMaskUpdate(requestId);
            };
            newImg.src = data.image;
        });
    }
}

/**
 * The SAM2 Bounding Box segmentation tool - drag to define a box and auto-generate a mask.
 */
class ImageEditorToolSam2BBox extends ImageEditorToolSam2Base {
    constructor(editor) {
        super(editor, 'sam2bbox', 'bbox', 'SAM2 BBox', 'Click and drag to create a bounding box. Release to generate mask.\nRequires SAM2 to be installed.', null);
        this.bboxStartX = null;
        this.bboxStartY = null;
        this.bboxEndX = null;
        this.bboxEndY = null;
        this.isDrawing = false;
    }

    draw() {
        if (this.isDrawing && this.bboxStartX != null && this.bboxEndX != null) {
            let ctx = this.editor.ctx;
            let [x1, y1] = this.editor.imageCoordToCanvasCoord(this.bboxStartX, this.bboxStartY);
            let [x2, y2] = this.editor.imageCoordToCanvasCoord(this.bboxEndX, this.bboxEndY);
            let minX = Math.min(x1, x2);
            let minY = Math.min(y1, y2);
            let maxX = Math.max(x1, x2);
            let maxY = Math.max(y1, y2);
            ctx.save();
            ctx.strokeStyle = '#33ff99';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            ctx.restore();
        }
    }

    addWarmupGenData(genData, cx, cy) {
        genData['sambbox'] = JSON.stringify([cx - 1, cy - 1, cx + 1, cy + 1]);
    }

    onMouseDown(e) {
        if (this.isWarmingUp || e.button != 0) {
            return;
        }
        this.editor.updateMousePosFrom(e);
        let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
        mouseX = Math.round(mouseX);
        mouseY = Math.round(mouseY);
        this.isDrawing = true;
        this.bboxStartX = mouseX;
        this.bboxStartY = mouseY;
        this.bboxEndX = mouseX;
        this.bboxEndY = mouseY;
    }

    onMouseMove(e) {
        if (!this.isDrawing) {
            return;
        }
        this.editor.updateMousePosFrom(e);
        let [mouseX, mouseY] = this.editor.canvasCoordToImageCoord(this.editor.mouseX, this.editor.mouseY);
        this.bboxEndX = Math.round(mouseX);
        this.bboxEndY = Math.round(mouseY);
        this.editor.redraw();
    }

    onGlobalMouseUp(e) {
        if (this.isWarmingUp || !this.isDrawing) {
            return;
        }
        this.isDrawing = false;
        this.requestMaskUpdate();
    }

    requestMaskUpdate() {
        if (!currentBackendFeatureSet.includes('sam2')) {
            $('#sam2_installer').modal('show');
            return;
        }
        if (this.bboxStartX == null || this.bboxEndX == null) {
            return;
        }
        this.maskRequestInFlight = true;
        let requestId = ++this.requestSerial;
        this.activeRequestId = requestId;
        let [genData, samInput] = this.getGeneralMaskRequestInputs();
        let minX = Math.max(0, Math.min(this.bboxStartX, this.bboxEndX));
        let minY = Math.max(0, Math.min(this.bboxStartY, this.bboxEndY));
        let maxX = Math.min(this.editor.realWidth - 1, Math.max(this.bboxStartX, this.bboxEndX));
        let maxY = Math.min(this.editor.realHeight - 1, Math.max(this.bboxStartY, this.bboxEndY));
        if (this.editor.hasSelection) {
            minX = Math.max(minX, this.editor.selectX);
            minY = Math.max(minY, this.editor.selectY);
            maxX = Math.min(maxX, this.editor.selectX + this.editor.selectWidth);
            maxY = Math.min(maxY, this.editor.selectY + this.editor.selectHeight);
        }
        if (maxX <= minX || maxY <= minY) {
            return;
        }
        let offX = samInput.offsetX;
        let offY = samInput.offsetY;
        genData['sambbox'] = JSON.stringify([minX - offX, minY - offY, maxX - offX, maxY - offY]);
        makeWSRequestT2I('GenerateText2ImageWS', genData, data => {
            if (requestId != this.activeRequestId) {
                return;
            }
            if (!data.image) {
                return;
            }
            let newImg = new Image();
            newImg.onload = () => {
                if (requestId != this.activeRequestId) {
                    return;
                }
                this.maskRequestInFlight = false;
                if (!this.editor.activeLayer || !this.editor.activeLayer.isMask) {
                    return;
                }
                this.applyMaskResult(newImg);
                this.editor.redraw();
            };
            newImg.src = data.image;
        });
    }
}
