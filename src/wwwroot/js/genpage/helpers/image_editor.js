
/**
 * Base class for an image editor tool, such as Paintbrush or the General tool.
 */
class ImageEditorTool {
    constructor(editor, id, icon, name, description, hotkey = null) {
        this.editor = editor;
        this.isTempTool = false;
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

function imageEditorClampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function imageEditorRgbToHex(r, g, b) {
    r = Math.round(imageEditorClampNumber(r, 0, 255));
    g = Math.round(imageEditorClampNumber(g, 0, 255));
    b = Math.round(imageEditorClampNumber(b, 0, 255));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function imageEditorNormalizeHexColor(value) {
    if (typeof value != 'string') {
        return null;
    }
    let text = value.trim().toLowerCase();
    let match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
    if (!match) {
        return null;
    }
    let color = match[1];
    if (color.length == 3 || color.length == 4) {
        color = `${color[0]}${color[0]}${color[1]}${color[1]}${color[2]}${color[2]}`;
    }
    if (color.length == 8) {
        color = color.substring(0, 6);
    }
    return `#${color}`;
}

function imageEditorHexToRgb(value) {
    let color = imageEditorNormalizeHexColor(value);
    if (!color) {
        return null;
    }
    return [
        parseInt(color.substring(1, 3), 16),
        parseInt(color.substring(3, 5), 16),
        parseInt(color.substring(5, 7), 16)
    ];
}

function imageEditorParseHueValue(value) {
    if (typeof value != 'string') {
        return null;
    }
    let text = value.trim().toLowerCase();
    if (text == '') {
        return null;
    }
    if (text.endsWith('deg')) {
        text = text.substring(0, text.length - 3);
    }
    else if (text.endsWith('turn')) {
        let turns = parseFloat(text.substring(0, text.length - 4));
        return Number.isFinite(turns) ? turns * 360 : null;
    }
    else if (text.endsWith('rad')) {
        let radians = parseFloat(text.substring(0, text.length - 3));
        return Number.isFinite(radians) ? radians * (180 / Math.PI) : null;
    }
    let number = parseFloat(text);
    return Number.isFinite(number) ? number : null;
}

function imageEditorParseRatioValue(value) {
    if (typeof value != 'string') {
        return null;
    }
    let text = value.trim().toLowerCase();
    if (text == '') {
        return null;
    }
    if (text.endsWith('%')) {
        let percent = parseFloat(text.substring(0, text.length - 1));
        return Number.isFinite(percent) ? imageEditorClampNumber(percent / 100, 0, 1) : null;
    }
    let number = parseFloat(text);
    if (!Number.isFinite(number)) {
        return null;
    }
    if (number >= 0 && number <= 1) {
        return number;
    }
    return imageEditorClampNumber(number / 100, 0, 1);
}

function imageEditorParseRgbComponent(value) {
    if (typeof value != 'string') {
        return null;
    }
    let text = value.trim().toLowerCase();
    if (text == '') {
        return null;
    }
    if (text.endsWith('%')) {
        let percent = parseFloat(text.substring(0, text.length - 1));
        if (!Number.isFinite(percent)) {
            return null;
        }
        return imageEditorClampNumber(percent, 0, 100) * 2.55;
    }
    let number = parseFloat(text);
    return Number.isFinite(number) ? imageEditorClampNumber(number, 0, 255) : null;
}

function imageEditorNormalizeHue(value) {
    return ((value % 360) + 360) % 360;
}

function imageEditorHslToRgb(h, s, l) {
    h = imageEditorNormalizeHue(h);
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c / 2;
    let [r, g, b] = [0, 0, 0];
    if (h < 60) { [r, g, b] = [c, x, 0]; }
    else if (h < 120) { [r, g, b] = [x, c, 0]; }
    else if (h < 180) { [r, g, b] = [0, c, x]; }
    else if (h < 240) { [r, g, b] = [0, x, c]; }
    else if (h < 300) { [r, g, b] = [x, 0, c]; }
    else { [r, g, b] = [c, 0, x]; }
    return [255 * (r + m), 255 * (g + m), 255 * (b + m)];
}

function imageEditorHsvToRgb(h, s, v) {
    h = imageEditorNormalizeHue(h);
    let c = v * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = v - c;
    let [r, g, b] = [0, 0, 0];
    if (h < 60) { [r, g, b] = [c, x, 0]; }
    else if (h < 120) { [r, g, b] = [x, c, 0]; }
    else if (h < 180) { [r, g, b] = [0, c, x]; }
    else if (h < 240) { [r, g, b] = [0, x, c]; }
    else if (h < 300) { [r, g, b] = [x, 0, c]; }
    else { [r, g, b] = [c, 0, x]; }
    return [255 * (r + m), 255 * (g + m), 255 * (b + m)];
}

function imageEditorRgbToHsv(r, g, b) {
    r = imageEditorClampNumber(r, 0, 255) / 255;
    g = imageEditorClampNumber(g, 0, 255) / 255;
    b = imageEditorClampNumber(b, 0, 255) / 255;
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let delta = max - min;
    let h = 0;
    if (delta > 0) {
        if (max == r) {
            h = 60 * (((g - b) / delta) % 6);
        }
        else if (max == g) {
            h = 60 * (((b - r) / delta) + 2);
        }
        else {
            h = 60 * (((r - g) / delta) + 4);
        }
    }
    h = imageEditorNormalizeHue(h);
    let s = max == 0 ? 0 : delta / max;
    let v = max;
    return [Math.round(h), Math.round(s * 255), Math.round(v * 255)];
}

function imageEditorParseFunctionColor(value) {
    if (typeof value != 'string') {
        return null;
    }
    let match = value.trim().toLowerCase().match(/^([a-z]+)\((.*)\)$/);
    if (!match) {
        return null;
    }
    let fn = match[1];
    let parts = match[2].split(',').map(part => part.trim()).filter(part => part != '');
    if ((fn == 'rgb' || fn == 'rgba') && parts.length >= 3) {
        let r = imageEditorParseRgbComponent(parts[0]);
        let g = imageEditorParseRgbComponent(parts[1]);
        let b = imageEditorParseRgbComponent(parts[2]);
        if (r == null || g == null || b == null) {
            return null;
        }
        return imageEditorRgbToHex(r, g, b);
    }
    if ((fn == 'hsl' || fn == 'hsla' || fn == 'hsa') && parts.length >= 3) {
        let h = imageEditorParseHueValue(parts[0]);
        let s = imageEditorParseRatioValue(parts[1]);
        let l = imageEditorParseRatioValue(parts[2]);
        if (h == null || s == null || l == null) {
            return null;
        }
        let [r, g, b] = imageEditorHslToRgb(h, s, l);
        return imageEditorRgbToHex(r, g, b);
    }
    if ((fn == 'hsv' || fn == 'hsva' || fn == 'hsb' || fn == 'hsba') && parts.length >= 3) {
        let h = imageEditorParseHueValue(parts[0]);
        let s = imageEditorParseRatioValue(parts[1]);
        let v = imageEditorParseRatioValue(parts[2]);
        if (h == null || s == null || v == null) {
            return null;
        }
        let [r, g, b] = imageEditorHsvToRgb(h, s, v);
        return imageEditorRgbToHex(r, g, b);
    }
    return null;
}

function imageEditorParseColorInput(value) {
    if (typeof value != 'string') {
        return null;
    }
    let text = value.trim();
    if (text == '') {
        return null;
    }
    if (text.match(/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/)) {
        text = `#${text}`;
    }
    let hex = imageEditorNormalizeHexColor(text);
    if (hex) {
        return hex;
    }
    let prefixed = text.match(/^([a-z]+)\s*:\s*(.+)$/i);
    if (prefixed) {
        let fnColor = imageEditorParseFunctionColor(`${prefixed[1]}(${prefixed[2]})`);
        if (fnColor) {
            return fnColor;
        }
    }
    let funcColor = imageEditorParseFunctionColor(text);
    if (funcColor) {
        return funcColor;
    }
    let rgbParts = text.split(',').map(part => part.trim()).filter(part => part != '');
    if (rgbParts.length == 3 || rgbParts.length == 4) {
        let looksLikeHsa = (rgbParts[1].includes('%') && rgbParts[2].includes('%')) || /(deg|turn|rad)$/i.test(rgbParts[0]);
        if (looksLikeHsa) {
            let h = imageEditorParseHueValue(rgbParts[0]);
            let s = imageEditorParseRatioValue(rgbParts[1]);
            let l = imageEditorParseRatioValue(rgbParts[2]);
            if (h != null && s != null && l != null) {
                let [r, g, b] = imageEditorHslToRgb(h, s, l);
                return imageEditorRgbToHex(r, g, b);
            }
        }
        let r = imageEditorParseRgbComponent(rgbParts[0]);
        let g = imageEditorParseRgbComponent(rgbParts[1]);
        let b = imageEditorParseRgbComponent(rgbParts[2]);
        if (r != null && g != null && b != null) {
            return imageEditorRgbToHex(r, g, b);
        }
    }
    return null;
}

function getImageEditorColorControlHtml(defaultColor) {
    return `
    <div class="image-editor-tool-block tool-block-nogrow image-editor-color-control">
        <label>Color:&nbsp;</label>
        <input type="text" class="auto-number id-col1" style="width:75px;flex-grow:0;" value="${defaultColor}">
        <input type="color" class="id-col2" value="${defaultColor}">
        <button class="basic-button id-col3">Pick</button>
        <button class="basic-button id-col4">Popout</button>
    </div>`;
}

class ImageEditorColorControl {
    constructor(tool, defaultColor) {
        this.tool = tool;
        this.currentColor = imageEditorParseColorInput(defaultColor) || '#ffffff';
        this.customColors = new Array(16).fill('#ffffff');
        this.nextCustomColorIndex = 0;
        this.draggingHue = false;
        this.draggingSv = false;
        this.draggingPanel = false;
        this.resizingPanel = false;
        this.panelDragStartX = 0;
        this.panelDragStartY = 0;
        this.panelStartLeft = 0;
        this.panelStartTop = 0;
        this.panelStartWidth = 0;
        this.panelStartHeight = 0;
        this.panelWidth = null;
        this.panelHeight = null;
        this.panelLeft = null;
        this.panelTop = null;
        this.hue = 0;
        this.sat = 0;
        this.val = 255;
        this.alpha = 255;
        this.root = this.tool.configDiv.querySelector('.image-editor-color-control');
        if (!this.root) {
            throw new Error(`Color control is missing for tool ${tool.id}`);
        }
        this.colorText = this.root.querySelector('.id-col1');
        this.colorSelector = this.root.querySelector('.id-col2');
        this.colorPickButton = this.root.querySelector('.id-col3');
        this.colorPopoutButton = this.root.querySelector('.id-col4');
        this.tool.colorText = this.colorText;
        this.tool.colorSelector = this.colorSelector;
        this.tool.colorPickButton = this.colorPickButton;
        this.tool.colorPopoutButton = this.colorPopoutButton;
        this.buildPopoutPanel();
        this.bind();
        this.setColor(this.currentColor, false);
    }

    buildPopoutPanel() {
        this.popoutPanel = document.createElement('div');
        this.popoutPanel.className = 'image-editor-color-floating-panel';
        this.popoutPanel.style.display = 'none';
        this.popoutPanel.innerHTML = `
        <div class="image-editor-color-floating-titlebar id-panel-titlebar">Color Picker</div>
        <div class="image-editor-color-floating-body">
            <div class="image-editor-color-floating-columns">
                <div class="image-editor-color-floating-left">
                    <div class="image-editor-color-floating-title">Basic colors</div>
                    <div class="image-editor-color-swatch-grid id-basic-swatches"></div>
                    <button class="basic-button image-editor-color-wide-button id-pick-screen">Pick Screen Color</button>
                    <div class="image-editor-color-floating-title image-editor-color-custom-title">Custom colors</div>
                    <div class="image-editor-color-swatch-grid id-custom-swatches"></div>
                    <button class="basic-button image-editor-color-wide-button id-add-custom">Add to Custom Colors</button>
                </div>
                <div class="image-editor-color-floating-right">
                    <div class="image-editor-color-canvas-row">
                        <canvas class="id-sv-canvas" width="230" height="172"></canvas>
                        <canvas class="id-hue-canvas" width="24" height="172"></canvas>
                    </div>
                    <div class="image-editor-color-fields-row">
                        <div class="image-editor-color-current-preview id-current-preview"></div>
                        <div class="image-editor-color-field-grid">
                            <label>Hue:</label><input type="number" class="id-hue image-editor-color-input" min="0" max="360" step="1" value="0">
                            <label>Red:</label><input type="number" class="id-red image-editor-color-input" min="0" max="255" step="1" value="255">
                            <label>Sat:</label><input type="number" class="id-sat image-editor-color-input" min="0" max="255" step="1" value="0">
                            <label>Green:</label><input type="number" class="id-green image-editor-color-input" min="0" max="255" step="1" value="255">
                            <label>Val:</label><input type="number" class="id-val image-editor-color-input" min="0" max="255" step="1" value="255">
                            <label>Blue:</label><input type="number" class="id-blue image-editor-color-input" min="0" max="255" step="1" value="255">
                            <label>Alpha channel:</label><input type="number" class="id-alpha image-editor-color-input" min="0" max="255" step="1" value="255">
                            <label>HTML:</label><input type="text" class="id-html image-editor-color-input image-editor-color-html-input" value="#ffffff">
                        </div>
                    </div>
                    <div class="image-editor-color-footer-row">
                        <button class="basic-button id-popout-ok">OK</button>
                        <button class="basic-button id-popout-cancel">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="image-editor-color-resize-handle id-panel-resize" title="Resize"></div>`;
        this.tool.editor.inputDiv.appendChild(this.popoutPanel);
        this.titleBar = this.popoutPanel.querySelector('.id-panel-titlebar');
        this.resizeHandle = this.popoutPanel.querySelector('.id-panel-resize');
        this.preview = this.popoutPanel.querySelector('.id-current-preview');
        this.basicSwatchesDiv = this.popoutPanel.querySelector('.id-basic-swatches');
        this.customSwatchesDiv = this.popoutPanel.querySelector('.id-custom-swatches');
        this.pickScreenButton = this.popoutPanel.querySelector('.id-pick-screen');
        this.addCustomButton = this.popoutPanel.querySelector('.id-add-custom');
        this.svCanvas = this.popoutPanel.querySelector('.id-sv-canvas');
        this.hueCanvas = this.popoutPanel.querySelector('.id-hue-canvas');
        this.svCtx = this.svCanvas.getContext('2d');
        this.hueCtx = this.hueCanvas.getContext('2d');
        this.hueInput = this.popoutPanel.querySelector('.id-hue');
        this.satInput = this.popoutPanel.querySelector('.id-sat');
        this.valInput = this.popoutPanel.querySelector('.id-val');
        this.redInput = this.popoutPanel.querySelector('.id-red');
        this.greenInput = this.popoutPanel.querySelector('.id-green');
        this.blueInput = this.popoutPanel.querySelector('.id-blue');
        this.alphaInput = this.popoutPanel.querySelector('.id-alpha');
        this.htmlInput = this.popoutPanel.querySelector('.id-html');
        this.popoutOkButton = this.popoutPanel.querySelector('.id-popout-ok');
        this.popoutCancelButton = this.popoutPanel.querySelector('.id-popout-cancel');
        this.basicColors = [
            '#000000', '#202020', '#3b3b3b', '#595959', '#727272', '#9a9a9a', '#c4c4c4', '#ffffff',
            '#7f0000', '#a44c00', '#a56d00', '#8fa100', '#2d8d00', '#008c57', '#0079a8', '#004e9f',
            '#28008f', '#56008f', '#8b006f', '#9f0047', '#b4002f', '#e60000', '#ff6f00', '#ffc300',
            '#d9ff00', '#7dff00', '#00ff44', '#00ffd0', '#00a6ff', '#0066ff', '#4f3dff', '#d100ff'
        ];
        this.renderBasicSwatches();
        this.renderCustomSwatches();
    }

    bind() {
        this.colorText.addEventListener('input', () => this.applyTextInput(this.colorText, false));
        this.colorText.addEventListener('change', () => this.applyTextInput(this.colorText, true));
        this.colorSelector.addEventListener('input', () => {
            this.setColor(this.colorSelector.value, true);
        });
        this.colorSelector.addEventListener('change', () => {
            this.setColor(this.colorSelector.value, true);
        });
        this.colorPickButton.addEventListener('click', () => this.toggleScreenPick());
        this.colorPopoutButton.addEventListener('click', () => this.togglePopout());
        this.pickScreenButton.addEventListener('click', () => this.toggleScreenPick());
        this.addCustomButton.addEventListener('click', () => this.addCurrentToCustomColors());
        this.popoutOkButton.addEventListener('click', () => this.closePopout());
        this.popoutCancelButton.addEventListener('click', () => this.closePopout());
        this.titleBar.addEventListener('mousedown', (e) => this.startPanelDrag(e));
        this.resizeHandle.addEventListener('mousedown', (e) => this.startPanelResize(e));
        this.bindNumberInput(this.hueInput, () => this.applyHsvFields());
        this.bindNumberInput(this.satInput, () => this.applyHsvFields());
        this.bindNumberInput(this.valInput, () => this.applyHsvFields());
        this.bindNumberInput(this.redInput, () => this.applyRgbFields());
        this.bindNumberInput(this.greenInput, () => this.applyRgbFields());
        this.bindNumberInput(this.blueInput, () => this.applyRgbFields());
        this.bindNumberInput(this.alphaInput, () => this.applyAlphaField());
        for (let input of this.popoutPanel.querySelectorAll('.image-editor-color-input')) {
            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('focus', (e) => e.stopPropagation());
        }
        // Commit HTML color only on explicit actions (Enter/blur), so partial typing isn't auto-corrected mid-entry.
        this.htmlInput.addEventListener('change', () => this.applyTextInput(this.htmlInput, true));
        this.htmlInput.addEventListener('keydown', (e) => {
            if (e.key == 'Enter') {
                this.applyTextInput(this.htmlInput, true);
            }
        });
        this.svCanvas.addEventListener('mousedown', (e) => {
            this.draggingSv = true;
            this.applySvFromPointer(e.clientX, e.clientY);
        });
        this.hueCanvas.addEventListener('mousedown', (e) => {
            this.draggingHue = true;
            this.applyHueFromPointer(e.clientY);
        });
        document.addEventListener('mousemove', (e) => this.onGlobalMouseMove(e));
        document.addEventListener('mouseup', () => this.onGlobalMouseUp());
        this.basicSwatchesDiv.addEventListener('click', (e) => this.onSwatchClick(e));
        this.customSwatchesDiv.addEventListener('click', (e) => this.onSwatchClick(e));
    }

    bindNumberInput(input, onApply) {
        input.addEventListener('input', () => {
            // Allow temporary empty state while user is editing (eg backspacing "347" to type a new value).
            if (input.value.trim() == '') {
                return;
            }
            onApply();
        });
        input.addEventListener('change', onApply);
        input.addEventListener('keyup', (e) => {
            if (e.key == 'Enter') {
                onApply();
            }
        });
    }

    onSwatchClick(e) {
        let button = findParentOfClass(e.target, 'image-editor-color-swatch');
        if (!button || !button.dataset.color) {
            return;
        }
        this.setColor(button.dataset.color, true);
    }

    onGlobalMouseMove(e) {
        if (this.draggingPanel) {
            let left = this.panelStartLeft + (e.clientX - this.panelDragStartX);
            let top = this.panelStartTop + (e.clientY - this.panelDragStartY);
            this.setPanelGeometry(left, top, this.panelWidth, this.panelHeight);
            return;
        }
        if (this.resizingPanel) {
            let width = this.panelStartWidth + (e.clientX - this.panelDragStartX);
            let height = this.panelStartHeight + (e.clientY - this.panelDragStartY);
            this.setPanelGeometry(this.panelLeft, this.panelTop, width, height);
            return;
        }
        if (this.draggingHue) {
            this.applyHueFromPointer(e.clientY);
        }
        if (this.draggingSv) {
            this.applySvFromPointer(e.clientX, e.clientY);
        }
    }

    onGlobalMouseUp() {
        this.draggingPanel = false;
        this.resizingPanel = false;
        this.draggingHue = false;
        this.draggingSv = false;
    }

    startPanelDrag(e) {
        if (e.button != 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.draggingPanel = true;
        this.resizingPanel = false;
        this.panelDragStartX = e.clientX;
        this.panelDragStartY = e.clientY;
        this.panelStartLeft = this.panelLeft ?? this.popoutPanel.offsetLeft;
        this.panelStartTop = this.panelTop ?? this.popoutPanel.offsetTop;
    }

    startPanelResize(e) {
        if (e.button != 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.resizingPanel = true;
        this.draggingPanel = false;
        this.panelDragStartX = e.clientX;
        this.panelDragStartY = e.clientY;
        this.panelStartWidth = this.panelWidth ?? this.popoutPanel.offsetWidth;
        this.panelStartHeight = this.panelHeight ?? this.popoutPanel.offsetHeight;
    }

    setPanelGeometry(left, top, width, height) {
        let container = this.tool.editor.inputDiv;
        let maxWidth = Math.max(220, container.clientWidth - 4);
        let maxHeight = Math.max(180, container.clientHeight - 4);
        let minWidth = Math.min(520, maxWidth);
        let minHeight = Math.min(360, maxHeight);
        width = imageEditorClampNumber(Math.round(width ?? this.popoutPanel.offsetWidth), minWidth, maxWidth);
        height = imageEditorClampNumber(Math.round(height ?? this.popoutPanel.offsetHeight), minHeight, maxHeight);
        left = Math.round(left ?? this.popoutPanel.offsetLeft);
        top = Math.round(top ?? this.popoutPanel.offsetTop);
        left = imageEditorClampNumber(left, 2, Math.max(2, container.clientWidth - width - 2));
        top = imageEditorClampNumber(top, 2, Math.max(2, container.clientHeight - height - 2));
        this.panelWidth = width;
        this.panelHeight = height;
        this.panelLeft = left;
        this.panelTop = top;
        this.popoutPanel.style.width = `${width}px`;
        this.popoutPanel.style.height = `${height}px`;
        this.popoutPanel.style.left = `${left}px`;
        this.popoutPanel.style.top = `${top}px`;
    }

    toggleScreenPick() {
        if (this.colorPickButton.classList.contains('interrupt-button')) {
            this.colorPickButton.classList.remove('interrupt-button');
            this.tool.editor.activateTool(this.tool.id);
            return;
        }
        this.colorPickButton.classList.add('interrupt-button');
        this.tool.editor.pickerTool.toolFor = this.tool;
        this.tool.editor.activateTool('picker');
    }

    applyHueFromPointer(clientY) {
        let rect = this.hueCanvas.getBoundingClientRect();
        let y = imageEditorClampNumber(clientY - rect.top, 0, rect.height);
        this.hue = Math.round((y / rect.height) * 360);
        if (this.hue > 359) {
            this.hue = 359;
        }
        this.hueInput.value = this.hue;
        this.applyHsvFields();
    }

    applySvFromPointer(clientX, clientY) {
        let rect = this.svCanvas.getBoundingClientRect();
        let x = imageEditorClampNumber(clientX - rect.left, 0, rect.width);
        let y = imageEditorClampNumber(clientY - rect.top, 0, rect.height);
        this.sat = Math.round((x / rect.width) * 255);
        this.val = Math.round((1 - (y / rect.height)) * 255);
        this.satInput.value = this.sat;
        this.valInput.value = this.val;
        this.applyHsvFields();
    }

    applyHsvFields() {
        let h = parseInt(this.hueInput.value);
        let s = parseInt(this.satInput.value);
        let v = parseInt(this.valInput.value);
        if (Number.isNaN(h)) {
            h = this.hue;
        }
        if (Number.isNaN(s)) {
            s = this.sat;
        }
        if (Number.isNaN(v)) {
            v = this.val;
        }
        h = Math.round(imageEditorClampNumber(h, 0, 359));
        s = Math.round(imageEditorClampNumber(s, 0, 255));
        v = Math.round(imageEditorClampNumber(v, 0, 255));
        this.hue = h;
        this.sat = s;
        this.val = v;
        this.hueInput.value = h;
        this.satInput.value = s;
        this.valInput.value = v;
        let [r, g, b] = imageEditorHsvToRgb(h, s / 255, v / 255);
        this.setColor(imageEditorRgbToHex(r, g, b), true, { preserveHsv: true });
    }

    applyRgbFields() {
        let r = parseInt(this.redInput.value);
        let g = parseInt(this.greenInput.value);
        let b = parseInt(this.blueInput.value);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
            let rgb = imageEditorHexToRgb(this.currentColor);
            [r, g, b] = rgb;
        }
        this.setColor(imageEditorRgbToHex(r, g, b), true);
    }

    applyAlphaField() {
        let alpha = parseInt(this.alphaInput.value);
        if (Number.isNaN(alpha)) {
            alpha = this.alpha;
        }
        this.alpha = Math.round(imageEditorClampNumber(alpha, 0, 255));
        this.alphaInput.value = this.alpha;
        this.preview.style.opacity = `${this.alpha / 255}`;
        // Map alpha to tool opacity when the tool supports explicit opacity controls.
        if (this.tool.opacityNumber && this.tool.opacitySelector) {
            let percent = Math.round(imageEditorClampNumber((this.alpha / 255) * 100, 1, 100));
            this.tool.opacityNumber.value = percent;
            this.tool.opacitySelector.value = percent;
            this.tool.onConfigChange();
        }
    }

    applyTextInput(input, strict) {
        if (!this.setColor(input.value, true) && strict) {
            input.value = this.currentColor;
        }
    }

    setColor(value, notify = false, options = {}) {
        let color = imageEditorParseColorInput(value);
        if (!color) {
            return false;
        }
        this.currentColor = color;
        this.tool.color = color;
        this.colorText.value = color;
        this.colorSelector.value = color;
        this.syncPopoutInputs(!!options.preserveHsv);
        if (this.tool.editor.activeTool?.id != 'picker') {
            this.colorPickButton.classList.remove('interrupt-button');
        }
        if (notify) {
            this.tool.onConfigChange();
        }
        return true;
    }

    getColor() {
        return this.currentColor;
    }

    syncPopoutInputs(preserveHsv = false) {
        let [r, g, b] = imageEditorHexToRgb(this.currentColor);
        let h, s, v;
        if (preserveHsv) {
            h = Math.round(imageEditorClampNumber(this.hue, 0, 359));
            s = Math.round(imageEditorClampNumber(this.sat, 0, 255));
            v = Math.round(imageEditorClampNumber(this.val, 0, 255));
        }
        else {
            [h, s, v] = imageEditorRgbToHsv(r, g, b);
            // Grayscale colors have undefined hue; keep the user's active hue instead of snapping to 0.
            if (s == 0) {
                h = this.hue;
            }
        }
        this.hue = h;
        this.sat = s;
        this.val = v;
        this.hueInput.value = h;
        this.satInput.value = s;
        this.valInput.value = v;
        this.redInput.value = r;
        this.greenInput.value = g;
        this.blueInput.value = b;
        this.alphaInput.value = this.alpha;
        this.htmlInput.value = this.currentColor;
        this.preview.style.backgroundColor = this.currentColor;
        this.preview.style.opacity = `${this.alpha / 255}`;
        this.drawHueCanvas();
        this.drawSvCanvas();
    }

    togglePopout() {
        if (this.popoutPanel.style.display != 'none' && this.popoutPanel.style.display != '') {
            this.closePopout();
            return;
        }
        if (this.tool.editor.activeTool?.id == 'picker' && this.tool.editor.pickerTool.toolFor == this.tool) {
            this.tool.editor.activateTool(this.tool.id);
        }
        this.popoutPanel.style.display = 'block';
        this.colorPopoutButton.classList.add('interrupt-button');
        this.updatePopoutPosition(true);
        this.drawHueCanvas();
        this.drawSvCanvas();
    }

    closePopout() {
        this.popoutPanel.style.display = 'none';
        this.colorPopoutButton.classList.remove('interrupt-button');
        this.draggingPanel = false;
        this.resizingPanel = false;
        this.draggingHue = false;
        this.draggingSv = false;
    }

    refreshFloatingPanel() {
        if (this.popoutPanel.style.display != 'none' && this.popoutPanel.style.display != '') {
            this.updatePopoutPosition();
        }
        if (this.tool.editor.activeTool?.id != 'picker') {
            this.colorPickButton.classList.remove('interrupt-button');
        }
    }

    updatePopoutPosition(isInitial = false) {
        let canvas = this.tool.editor.canvas;
        if (!canvas) {
            return;
        }
        let margin = 12;
        let left = this.panelLeft;
        let top = this.panelTop;
        let width = this.panelWidth;
        let height = this.panelHeight;
        if (isInitial || left == null || top == null) {
            left = canvas.offsetLeft + margin;
            top = canvas.offsetTop + margin;
        }
        if (width == null) {
            width = this.popoutPanel.offsetWidth;
        }
        if (height == null) {
            height = this.popoutPanel.offsetHeight;
        }
        this.setPanelGeometry(left, top, width, height);
    }

    drawHueCanvas() {
        let ctx = this.hueCtx;
        let width = this.hueCanvas.width;
        let height = this.hueCanvas.height;
        ctx.clearRect(0, 0, width, height);
        let gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#ff0000');
        gradient.addColorStop(1 / 6, '#ffff00');
        gradient.addColorStop(2 / 6, '#00ff00');
        gradient.addColorStop(3 / 6, '#00ffff');
        gradient.addColorStop(4 / 6, '#0000ff');
        gradient.addColorStop(5 / 6, '#ff00ff');
        gradient.addColorStop(1, '#ff0000');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        let y = Math.round((this.hue / 360) * height);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    drawSvCanvas() {
        let ctx = this.svCtx;
        let width = this.svCanvas.width;
        let height = this.svCanvas.height;
        ctx.clearRect(0, 0, width, height);
        let [r, g, b] = imageEditorHsvToRgb(this.hue, 1, 1);
        ctx.fillStyle = imageEditorRgbToHex(r, g, b);
        ctx.fillRect(0, 0, width, height);
        let whiteGradient = ctx.createLinearGradient(0, 0, width, 0);
        whiteGradient.addColorStop(0, '#ffffff');
        whiteGradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = whiteGradient;
        ctx.fillRect(0, 0, width, height);
        let blackGradient = ctx.createLinearGradient(0, 0, 0, height);
        blackGradient.addColorStop(0, 'rgba(0,0,0,0)');
        blackGradient.addColorStop(1, '#000000');
        ctx.fillStyle = blackGradient;
        ctx.fillRect(0, 0, width, height);
        let x = Math.round((this.sat / 255) * width);
        let y = Math.round((1 - (this.val / 255)) * height);
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    renderBasicSwatches() {
        this.basicSwatchesDiv.innerHTML = '';
        for (let color of this.basicColors) {
            let button = document.createElement('button');
            button.type = 'button';
            button.className = 'image-editor-color-swatch';
            button.dataset.color = color;
            button.title = color;
            button.style.backgroundColor = color;
            this.basicSwatchesDiv.appendChild(button);
        }
    }

    renderCustomSwatches() {
        this.customSwatchesDiv.innerHTML = '';
        for (let color of this.customColors) {
            let button = document.createElement('button');
            button.type = 'button';
            button.className = 'image-editor-color-swatch';
            button.dataset.color = color;
            button.title = color;
            button.style.backgroundColor = color;
            this.customSwatchesDiv.appendChild(button);
        }
    }

    addCurrentToCustomColors() {
        this.customColors[this.nextCustomColorIndex] = this.currentColor;
        this.nextCustomColorIndex = (this.nextCustomColorIndex + 1) % this.customColors.length;
        this.renderCustomSwatches();
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
                    if (current.name == 'top-left') {
                        let [origBRX, origBRY] = applyRotate(origX + origWidth, origY + origHeight);
                        let widthChange = Math.min(dx, target.width - 1);
                        let heightChange = Math.min(dy, target.height - 1);
                        target.offsetX += widthChange;
                        target.offsetY += heightChange;
                        target.width -= widthChange;
                        target.height -= heightChange;
                        let [newBRX, newBRY] = applyRotate(target.offsetX + target.width, target.offsetY + target.height);
                        target.offsetX += origBRX - newBRX;
                        target.offsetY += origBRY - newBRY;
                    }
                    else if (current.name == 'top-right') {
                        let [origBLX, origBLY] = applyRotate(origX, origY + origHeight);
                        let widthChange = Math.max(dx, 1- target.width);
                        let heightChange = Math.min(dy, target.height - 1);
                        target.offsetY += heightChange;
                        target.width += widthChange;
                        target.height -= heightChange;
                        let [newBLX, newBLY] = applyRotate(target.offsetX, target.offsetY + target.height);
                        target.offsetX += origBLX - newBLX;
                        target.offsetY += origBLY - newBLY;
                    }
                    else if (current.name == 'bottom-left') {
                        let [origTRX, origTRY] = applyRotate(origX + origWidth, origY);
                        let widthChange = Math.min(dx, target.width - 1);
                        let heightChange = Math.max(dy, 1 - target.height);
                        target.offsetX += widthChange;
                        target.width -= widthChange;
                        target.height += heightChange;
                        let [newTRX, newTRY] = applyRotate(target.offsetX + target.width, target.offsetY);
                        target.offsetX += origTRX - newTRX;
                        target.offsetY += origTRY - newTRY;
                    }
                    else if (current.name == 'bottom-right') {
                        let [origTLX, origTLY] = applyRotate(origX, origY);
                        let widthChange = Math.max(dx, 1 - target.width);
                        let heightChange = Math.max(dy, 1 - target.height);
                        target.width += widthChange;
                        target.height += heightChange;
                        let [newTLX, newTLY] = applyRotate(target.offsetX, target.offsetY);
                        target.offsetX += origTLX - newTLX;
                        target.offsetY += origTLY - newTLY;
                    }
                    else if (current.name == 'center-top') {
                        let [origCBX, origCBY] = applyRotate(origX + origWidth / 2, origY + origHeight);
                        let heightChange = Math.min(dy, target.height - 1);
                        target.offsetY += heightChange;
                        target.height -= heightChange;
                        let [newCBX, newCBY] = applyRotate(target.offsetX + target.width / 2, target.offsetY + target.height);
                        target.offsetX += origCBX - newCBX;
                        target.offsetY += origCBY - newCBY;
                    }
                    else if (current.name == 'center-bottom') {
                        let [origCTX, origCTY] = applyRotate(origX + origWidth / 2, origY);
                        let heightChange = Math.max(dy, 1 - target.height);
                        target.height += heightChange;
                        let [newCTX, newCTY] = applyRotate(target.offsetX + target.width / 2, target.offsetY);
                        target.offsetX += origCTX - newCTX;
                        target.offsetY += origCTY - newCTY;
                    }
                    else if (current.name == 'center-left') {
                        let [origCRX, origCRY] = applyRotate(origX + origWidth, origY + origHeight / 2);
                        let widthChange = Math.min(dx, target.width - 1);
                        target.offsetX += widthChange;
                        target.width -= widthChange;
                        let [newCRX, newCRY] = applyRotate(target.offsetX + target.width, target.offsetY + target.height / 2);
                        target.offsetX += origCRX - newCRX;
                        target.offsetY += origCRY - newCRY;
                    }
                    else if (current.name == 'center-right') {
                        let [origCLX, origCLY] = applyRotate(origX, origY + origHeight / 2);
                        let widthChange = Math.max(dx, 1 - target.width);
                        target.width += widthChange;
                        let [newCLX, newCLY] = applyRotate(target.offsetX, target.offsetY + target.height / 2);
                        target.offsetX += origCLX - newCLX;
                        target.offsetY += origCLY - newCLY;
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
        let makeRegionButton = `<div class="image-editor-tool-block">
            <button class="basic-button id-make-region">Make Region</button>
        </div>`;
        this.configDiv.innerHTML = makeRegionButton;
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
class ImageEditorToolBrush extends ImageEditorTool {
    constructor(editor, id, icon, name, description, isEraser, hotkey = null) {
        super(editor, id, icon, name, description, hotkey);
        this.cursor = 'none';
        this.color = '#ffffff';
        this.radius = 10;
        this.opacity = 1;
        this.flow = 1;
        this.brushing = false;
        this.isEraser = isEraser;
        this.brushStyle = 'round';
        this.brushStyleOptions = [
            { id: 'round', name: 'Round' },
            { id: 'airbrush', name: 'Round Airbrush' },
            { id: 'square', name: 'Square' },
            { id: 'diamond', name: 'Diamond' },
            { id: 'triangle', name: 'Triangle' },
            { id: 'pentagon', name: 'Pentagon' },
            { id: 'hexagon', name: 'Hexagon' },
            { id: 'octagon', name: 'Octagon' },
            { id: 'horizontal', name: 'Horizontal' },
            { id: 'vertical', name: 'Vertical' },
            { id: 'slash', name: 'Slash' },
            { id: 'backslash', name: 'Backslash' },
            { id: 'cross', name: 'Cross' },
            { id: 'xcross', name: 'X Cross' },
            { id: 'star', name: 'Star' },
            { id: 'hollow', name: 'Hollow Ring' },
            { id: 'hollow-square', name: 'Hollow Square' },
            { id: 'checker', name: 'Checker' },
            { id: 'scatter', name: 'Scatter' },
            { id: 'splatter', name: 'Splatter' },
            { id: 'pixel', name: 'Pixel' }
        ];
        let colorHTML = getImageEditorColorControlHtml('#ffffff');
        let styleHtml = `<div class="image-editor-tool-block tool-block-nogrow">
                <label>Brush:&nbsp;</label>
                <select class="id-style" style="width:145px;">${this.brushStyleOptions.map(option => `<option value="${option.id}">${option.name}</option>`).join('')}</select>
            </div>`;
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
        let flowHtml = `<div class="image-editor-tool-block id-flow-block">
                <label>Flow:&nbsp;</label>
                <input type="number" style="width: 40px;" class="auto-number id-flow1" min="1" max="100" step="1" value="100">
                <div class="auto-slider-range-wrapper" style="${getRangeStyle(100, 1, 100)}">
                    <input type="range" style="flex-grow: 2" class="auto-slider-range id-flow2" min="1" max="100" step="1" value="100" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
                </div>
            </div>`;
        if (isEraser) {
            this.configDiv.innerHTML = styleHtml + radiusHtml + opacityHtml + flowHtml;
        }
        else {
            this.configDiv.innerHTML = colorHTML + styleHtml + radiusHtml + opacityHtml + flowHtml;
            this.colorControl = new ImageEditorColorControl(this, '#ffffff');
        }
        enableSliderForBox(this.configDiv.querySelector('.id-rad-block'));
        enableSliderForBox(this.configDiv.querySelector('.id-opac-block'));
        enableSliderForBox(this.configDiv.querySelector('.id-flow-block'));
        this.radiusNumber = this.configDiv.querySelector('.id-rad1');
        this.radiusSelector = this.configDiv.querySelector('.id-rad2');
        this.opacityNumber = this.configDiv.querySelector('.id-opac1');
        this.opacitySelector = this.configDiv.querySelector('.id-opac2');
        this.flowNumber = this.configDiv.querySelector('.id-flow1');
        this.flowSelector = this.configDiv.querySelector('.id-flow2');
        this.styleSelector = this.configDiv.querySelector('.id-style');
        this.radiusNumber.addEventListener('change', () => { this.onConfigChange(); });
        this.opacityNumber.addEventListener('change', () => { this.onConfigChange(); });
        this.flowNumber.addEventListener('change', () => { this.onConfigChange(); });
        this.styleSelector.addEventListener('change', () => { this.onConfigChange(); });
        this.lastTouch = null;
    }

    setColor(col) {
        if (!this.isEraser && this.colorControl) {
            this.colorControl.setColor(col, true);
        }
    }

    setInactive() {
        super.setInactive();
        if (this.colorControl) {
            this.colorControl.closePopout();
        }
    }

    onConfigChange() {
        if (!this.isEraser) {
            this.color = this.colorControl.getColor();
        }
        this.radius = parseInt(this.radiusNumber.value);
        this.opacity = parseInt(this.opacityNumber.value) / 100;
        this.flow = parseInt(this.flowNumber.value) / 100;
        this.brushStyle = this.styleSelector.value || 'round';
        this.editor.redraw();
    }

    draw() {
        this.drawCircleBrush(this.editor.mouseX, this.editor.mouseY, this.radius * this.editor.zoomLevel);
    }

    brush(force = 1) {
        let [lastX, lastY] = this.editor.activeLayer.canvasCoordToLayerCoord(this.editor.lastMouseX, this.editor.lastMouseY);
        let [x, y] = this.editor.activeLayer.canvasCoordToLayerCoord(this.editor.mouseX, this.editor.mouseY);
        this.paintStroke(lastX, lastY, x, y, this.radius * force);
        this.editor.markChanged();
    }

    getBrushSpacing(radius) {
        if (this.brushStyle == 'airbrush') {
            return Math.max(1, radius * 0.18);
        }
        if (this.brushStyle == 'scatter' || this.brushStyle == 'splatter') {
            return Math.max(1, radius * 0.7);
        }
        if (this.brushStyle == 'pixel') {
            return Math.max(1, Math.floor(radius * 0.35));
        }
        return Math.max(1, radius * 0.4);
    }

    paintStroke(x1, y1, x2, y2, radius) {
        let dx = x2 - x1;
        let dy = y2 - y1;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let spacing = this.getBrushSpacing(radius);
        let steps = Math.max(1, Math.ceil(dist / spacing));
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            this.stampBrush(x1 + dx * t, y1 + dy * t, radius);
        }
    }

    drawRotatedRectStamp(x, y, width, height, angle) {
        let ctx = this.bufferLayer.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.restore();
    }

    drawRegularPolygon(x, y, radius, points, angleOffset = -Math.PI / 2) {
        let ctx = this.bufferLayer.ctx;
        ctx.beginPath();
        for (let i = 0; i < points; i++) {
            let angle = angleOffset + (Math.PI * 2 * i / points);
            let px = x + radius * Math.cos(angle);
            let py = y + radius * Math.sin(angle);
            if (i == 0) {
                ctx.moveTo(px, py);
            }
            else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    drawStar(x, y, radius, points = 5) {
        let ctx = this.bufferLayer.ctx;
        let innerRadius = radius * 0.45;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            let isOuter = i % 2 == 0;
            let r = isOuter ? radius : innerRadius;
            let angle = -Math.PI / 2 + (Math.PI * i / points);
            let px = x + r * Math.cos(angle);
            let py = y + r * Math.sin(angle);
            if (i == 0) {
                ctx.moveTo(px, py);
            }
            else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    stampBrush(x, y, radius) {
        let ctx = this.bufferLayer.ctx;
        let thickness = Math.max(1, radius * 0.55);
        let thin = Math.max(1, radius * 0.35);
        let stampAlpha = imageEditorClampNumber(this.flow, 0.01, 1);
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.save();
        ctx.globalAlpha = stampAlpha;
        switch (this.brushStyle) {
        case 'airbrush': {
            let rgb = imageEditorHexToRgb(this.color) || [255, 255, 255];
            let grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
            grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`);
            grad.addColorStop(0.4, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.45)`);
            grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(1, radius), 0, 2 * Math.PI);
            ctx.fill();
            break;
        }
        case 'square':
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            break;
        case 'diamond':
            ctx.beginPath();
            ctx.moveTo(x, y - radius);
            ctx.lineTo(x + radius, y);
            ctx.lineTo(x, y + radius);
            ctx.lineTo(x - radius, y);
            ctx.closePath();
            ctx.fill();
            break;
        case 'triangle':
            this.drawRegularPolygon(x, y, radius, 3);
            break;
        case 'pentagon':
            this.drawRegularPolygon(x, y, radius, 5);
            break;
        case 'hexagon':
            this.drawRegularPolygon(x, y, radius, 6);
            break;
        case 'octagon':
            this.drawRegularPolygon(x, y, radius, 8);
            break;
        case 'horizontal':
            ctx.fillRect(x - radius, y - thin / 2, radius * 2, thin);
            break;
        case 'vertical':
            ctx.fillRect(x - thin / 2, y - radius, thin, radius * 2);
            break;
        case 'slash':
            this.drawRotatedRectStamp(x, y, radius * 2.4, thin, -Math.PI / 4);
            break;
        case 'backslash':
            this.drawRotatedRectStamp(x, y, radius * 2.4, thin, Math.PI / 4);
            break;
        case 'cross':
            ctx.fillRect(x - radius, y - thin / 2, radius * 2, thin);
            ctx.fillRect(x - thin / 2, y - radius, thin, radius * 2);
            break;
        case 'xcross':
            this.drawRotatedRectStamp(x, y, radius * 2.4, thin, Math.PI / 4);
            this.drawRotatedRectStamp(x, y, radius * 2.4, thin, -Math.PI / 4);
            break;
        case 'star':
            this.drawStar(x, y, radius);
            break;
        case 'hollow':
            ctx.save();
            ctx.lineWidth = Math.max(1, radius * 0.45);
            ctx.beginPath();
            ctx.arc(x, y, Math.max(1, radius - ctx.lineWidth / 2), 0, 2 * Math.PI);
            ctx.stroke();
            ctx.restore();
            break;
        case 'hollow-square':
            ctx.save();
            ctx.lineWidth = thickness;
            ctx.strokeRect(x - radius + thickness / 2, y - radius + thickness / 2, radius * 2 - thickness, radius * 2 - thickness);
            ctx.restore();
            break;
        case 'checker': {
            let cell = Math.max(1, Math.round(radius * 0.55));
            for (let row = -1; row <= 1; row++) {
                for (let col = -1; col <= 1; col++) {
                    if ((row + col) % 2 == 0) {
                        let cx = x + col * cell;
                        let cy = y + row * cell;
                        ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
                    }
                }
            }
            break;
        }
        case 'scatter':
            for (let i = 0; i < 5; i++) {
                let angle = Math.random() * Math.PI * 2;
                let dist = Math.random() * radius * 0.9;
                let dotRadius = Math.max(1, radius * (0.12 + Math.random() * 0.22));
                this.bufferLayer.drawFilledCircle(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, dotRadius, this.color);
            }
            this.bufferLayer.drawFilledCircle(x, y, Math.max(1, radius * 0.18), this.color);
            break;
        case 'splatter':
            for (let i = 0; i < 9; i++) {
                let angle = Math.random() * Math.PI * 2;
                let dist = Math.random() * radius * 1.8;
                let dotRadius = Math.max(1, radius * (0.08 + Math.random() * 0.28));
                this.bufferLayer.drawFilledCircle(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, dotRadius, this.color);
            }
            break;
        case 'pixel': {
            let pixel = Math.max(1, Math.round(radius * 0.35));
            let px = Math.round(x / pixel) * pixel;
            let py = Math.round(y / pixel) * pixel;
            ctx.fillRect(px - pixel, py - pixel, pixel * 2, pixel * 2);
            break;
        }
        case 'round':
        default:
            this.bufferLayer.drawFilledCircle(x, y, radius, this.color);
            break;
        }
        ctx.restore();
    }

    getForceFrom(e) {
        if (e.touches && e.touches.length > 0) {
            let touch = e.touches.item(0);
            this.lastTouch = new Date().getTime();
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
            this.lastTouch = new Date().getTime();
        }
        if (!e.touches && this.lastTouch && new Date().getTime() - this.lastTouch < 1000) {
            return;
        }
        this.brushing = true;
        let target = this.editor.activeLayer;
        this.bufferLayer = new ImageEditorLayer(this.editor, target.canvas.width, target.canvas.height, target);
        this.bufferLayer.opacity = this.opacity;
        if (this.isEraser) {
            this.bufferLayer.globalCompositeOperation = 'destination-out';
        }
        target.childLayers.push(this.bufferLayer);
        this.brush(this.getForceFrom(e));
    }

    onMouseMove(e) {
        if (this.brushing) {
            if (e.touches) {
                this.lastTouch = new Date().getTime();
            }
            if (!e.touches && this.lastTouch && new Date().getTime() - this.lastTouch < 1000) {
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
class ImageEditorToolBucket extends ImageEditorTool {
    constructor(editor) {
        super(editor, 'paintbucket', 'paintbucket', 'Paint Bucket', 'Fill an area with a color.\nHotKey: P', 'p');
        this.cursor = 'crosshair';
        this.color = '#ffffff';
        this.threshold = 10;
        this.opacity = 1;
        let colorHTML = getImageEditorColorControlHtml('#ffffff');
        let thresholdHtml = `<div class="image-editor-tool-block id-thresh-block">
                <label>Threshold:&nbsp;</label>
                <input type="number" style="width: 40px;" class="auto-number id-thresh1" min="1" max="256" step="1" value="10">
                <div class="auto-slider-range-wrapper" style="${getRangeStyle(10, 1, 256)}">
                    <input type="range" style="flex-grow: 2" data-ispot="true" class="auto-slider-range id-thresh2" min="1" max="256" step="1" value="10" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
                </div>
            </div>`;
        this.configDiv.innerHTML = colorHTML + thresholdHtml;
        this.colorControl = new ImageEditorColorControl(this, '#ffffff');
        enableSliderForBox(this.configDiv.querySelector('.id-thresh-block'));
        this.thresholdNumber = this.configDiv.querySelector('.id-thresh1');
        this.thresholdSelector = this.configDiv.querySelector('.id-thresh2');
        this.thresholdNumber.addEventListener('change', () => { this.onConfigChange(); });
        this.lastTouch = null;
    }

    setColor(col) {
        if (this.colorControl) {
            this.colorControl.setColor(col, true);
        }
    }

    setInactive() {
        super.setInactive();
        if (this.colorControl) {
            this.colorControl.closePopout();
        }
    }

    onConfigChange() {
        this.color = this.colorControl.getColor();
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
            return x >= 0 && y >= 0 && x < width && y < height && maskData[y * width + x] == 0 && isInRange(getColorAt(x, y));
        }
        let stack = [[targetX, targetY]];
        while (stack.length > 0) {
            let [x, y] = stack.pop();
            if (!canInclude(x, y)) {
                continue;
            }
            if (isInRange(getColorAt(x, y))) {
                setPixel(x, y);
                if (canInclude(x - 1, y)) { stack.push([x - 1, y]); }
                if (canInclude(x + 1, y)) { stack.push([x + 1, y]); }
                if (canInclude(x, y - 1)) { stack.push([x, y - 1]); }
                if (canInclude(x, y + 1)) { stack.push([x, y + 1]); }
            }
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
class ImageEditorToolShape extends ImageEditorTool {
    constructor(editor) {
        super(editor, 'shape', 'shape', 'Shape', 'Create basic colored shape outlines.\nClick and drag to draw a shape.\nHotKey: X', 'x');
        this.cursor = 'crosshair';
        this.color = '#ff0000';
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
        let colorHTML = getImageEditorColorControlHtml('#ff0000');
        let shapeHTML = `
        <div class="image-editor-tool-block tool-block-nogrow">
            <label>Shape:&nbsp;</label>
            <select class="id-shape" style="width:100px;">
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
            </select>
        </div>`;
        let strokeHTML = `
        <div class="image-editor-tool-block id-stroke-block">
            <label>Width:&nbsp;</label>
            <input type="number" style="width: 40px;" class="auto-number id-stroke1" min="1" max="20" step="1" value="4">
            <div class="auto-slider-range-wrapper" style="${getRangeStyle(4, 1, 20)}">
                <input type="range" style="flex-grow: 2" class="auto-slider-range id-stroke2" min="1" max="20" step="1" value="4" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
            </div>
            </div>`;
        this.configDiv.innerHTML = colorHTML + shapeHTML + strokeHTML;
        this.colorControl = new ImageEditorColorControl(this, '#ff0000');
        this.shapeSelect = this.configDiv.querySelector('.id-shape');
        this.strokeNumber = this.configDiv.querySelector('.id-stroke1');
        this.strokeSelector = this.configDiv.querySelector('.id-stroke2');
        this.shapeSelect.addEventListener('change', () => {
            this.shape = this.shapeSelect.value;
            this.editor.redraw();
        });
        enableSliderForBox(this.configDiv.querySelector('.id-stroke-block'));
        this.strokeNumber.addEventListener('change', () => { this.onConfigChange(); });
    }
    
    setColor(col) {
        if (this.colorControl) {
            this.colorControl.setColor(col, true);
        }
    }

    setInactive() {
        super.setInactive();
        if (this.colorControl) {
            this.colorControl.closePopout();
        }
    }
    
    onConfigChange() {
        this.color = this.colorControl.getColor();
        this.strokeWidth = parseInt(this.strokeNumber.value);
        this.editor.redraw();
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

    drawShapeToCanvas(ctx, type, x, y, width, height) {
        ctx.beginPath();
        if (type == 'rectangle') {
            ctx.rect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
        }
        else if (type == 'circle') {
            let radius = Math.sqrt(width * width + height * height) / 2;
            ctx.arc(Math.round(x + width / 2), Math.round(y + height / 2), Math.round(radius), 0, 2 * Math.PI);
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
        this.editor.ctx.imageSmoothingEnabled = false;
        this.editor.ctx.setLineDash([]);
        if (this.shape == 'rectangle') {
            let thickness = Math.max(1, Math.round(this.strokeWidth * this.editor.zoomLevel));
            this.editor.ctx.fillStyle = this.color;
            this.drawRectangleBorder(this.editor.ctx, Math.round(canvasX1), Math.round(canvasY1), Math.round(canvasWidth), Math.round(canvasHeight), thickness);
        }
        else {
            this.editor.ctx.strokeStyle = this.color;
            this.editor.ctx.lineWidth = Math.max(1, Math.round(this.strokeWidth * this.editor.zoomLevel));
            this.drawShapeToCanvas(this.editor.ctx, this.shape, canvasX1, canvasY1, canvasWidth, canvasHeight);
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
    
    onMouseMove(e) {
        if (!this.isDrawing) {
            return;
        }
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
        this.drawShape();
    }

    onGlobalMouseMove(e) {
        if (!this.isDrawing) {
            return;
        }
        this.editor.updateMousePosFrom(e);
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
        this.drawShape();
    }
    
    onMouseUp(e) {
        if (e.button != 0 || !this.isDrawing) {
            return;
        }
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
        this.finishDrawing();
    }
    
    onGlobalMouseUp(e) {
        if (e.button != 0 || !this.isDrawing) {
            return;
        }
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
        this.bufferLayer.ctx.imageSmoothingEnabled = false;
        this.bufferLayer.ctx.setLineDash([]);
        if (this.shape == 'rectangle') {
            let thickness = Math.max(1, Math.round(this.strokeWidth));
            this.bufferLayer.ctx.fillStyle = this.color;
            this.drawRectangleBorder(this.bufferLayer.ctx, startX, startY, width, height, thickness);
        }
        else {
            this.bufferLayer.ctx.strokeStyle = this.color;
            this.bufferLayer.ctx.lineWidth = Math.max(1, Math.round(this.strokeWidth));
            this.drawShapeToCanvas(this.bufferLayer.ctx, this.shape, startX, startY, width, height);
        }
        this.bufferLayer.ctx.restore();
        this.bufferLayer.hasAnyContent = true;
        this.hasDrawn = true;
        this.editor.markChanged();
        this.editor.redraw();
    }
}

/**
 * The Pen tool for editable bezier paths.
 */
class ImageEditorToolPen extends ImageEditorTool {
    constructor(editor) {
        super(editor, 'pen', 'pen', 'Pen', 'Draw editable paths with standard or curvature mode.\nPath mode draws outlines, shape mode fills.\nHotKey: N', 'n');
        this.cursor = 'crosshair';
        this.color = '#00d0ff';
        this.strokeWidth = 3;
        this.penMode = 'standard';
        this.outputMode = 'path';
        this.curveTension = 1;
        this.points = [];
        this.closed = false;
        this.dragging = false;
        this.dragKind = null;
        this.dragIndex = -1;
        this.dragMoved = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        let colorHTML = getImageEditorColorControlHtml(this.color);
        let modeHTML = `
        <div class="image-editor-tool-block tool-block-nogrow">
            <label>Pen:&nbsp;</label>
            <select class="id-pen-mode" style="width:125px;">
                <option value="standard">Standard</option>
                <option value="curvature">Curvature</option>
            </select>
        </div>
        <div class="image-editor-tool-block tool-block-nogrow">
            <label>Mode:&nbsp;</label>
            <select class="id-output-mode" style="width:100px;">
                <option value="path">Path</option>
                <option value="shape">Shape</option>
            </select>
        </div>`;
        let strokeHTML = `
        <div class="image-editor-tool-block id-pen-stroke-block">
            <label>Width:&nbsp;</label>
            <input type="number" style="width: 40px;" class="auto-number id-pen-stroke1" min="1" max="64" step="1" value="3">
            <div class="auto-slider-range-wrapper" style="${getRangeStyle(3, 1, 64)}">
                <input type="range" style="flex-grow: 2" class="auto-slider-range id-pen-stroke2" min="1" max="64" step="1" value="3" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
            </div>
        </div>`;
        let tensionHTML = `
        <div class="image-editor-tool-block id-pen-tension-block">
            <label>Curve:&nbsp;</label>
            <input type="number" style="width: 40px;" class="auto-number id-pen-tension1" min="10" max="200" step="1" value="100">
            <div class="auto-slider-range-wrapper" style="${getRangeStyle(100, 10, 200)}">
                <input type="range" style="flex-grow: 2" class="auto-slider-range id-pen-tension2" min="10" max="200" step="1" value="100" oninput="updateRangeStyle(arguments[0])" onchange="updateRangeStyle(arguments[0])">
            </div>
        </div>`;
        let actionsHTML = `
        <div class="image-editor-tool-block tool-block-nogrow">
            <button class="basic-button id-pen-apply">Apply</button>
            <button class="basic-button id-pen-close">Close Path</button>
            <button class="basic-button id-pen-undo">Undo Point</button>
            <button class="basic-button id-pen-clear">Clear</button>
        </div>`;
        this.configDiv.innerHTML = colorHTML + modeHTML + strokeHTML + tensionHTML + actionsHTML;
        this.colorControl = new ImageEditorColorControl(this, this.color);
        this.penModeSelect = this.configDiv.querySelector('.id-pen-mode');
        this.outputModeSelect = this.configDiv.querySelector('.id-output-mode');
        this.strokeNumber = this.configDiv.querySelector('.id-pen-stroke1');
        this.strokeSelector = this.configDiv.querySelector('.id-pen-stroke2');
        this.tensionBlock = this.configDiv.querySelector('.id-pen-tension-block');
        this.tensionNumber = this.configDiv.querySelector('.id-pen-tension1');
        this.tensionSelector = this.configDiv.querySelector('.id-pen-tension2');
        this.applyButton = this.configDiv.querySelector('.id-pen-apply');
        this.closeButton = this.configDiv.querySelector('.id-pen-close');
        this.undoButton = this.configDiv.querySelector('.id-pen-undo');
        this.clearButton = this.configDiv.querySelector('.id-pen-clear');
        enableSliderForBox(this.configDiv.querySelector('.id-pen-stroke-block'));
        enableSliderForBox(this.configDiv.querySelector('.id-pen-tension-block'));
        this.penModeSelect.addEventListener('change', () => this.onConfigChange());
        this.outputModeSelect.addEventListener('change', () => this.onConfigChange());
        this.strokeNumber.addEventListener('change', () => this.onConfigChange());
        this.tensionNumber.addEventListener('change', () => this.onConfigChange());
        this.applyButton.addEventListener('click', () => this.applyPath());
        this.closeButton.addEventListener('click', () => this.toggleClosedPath());
        this.undoButton.addEventListener('click', () => this.undoPoint());
        this.clearButton.addEventListener('click', () => this.clearPath());
        this.refreshUiState();
    }

    setColor(col) {
        if (this.colorControl) {
            this.colorControl.setColor(col, true);
        }
    }

    setInactive() {
        super.setInactive();
        if (this.colorControl) {
            this.colorControl.closePopout();
        }
    }

    onConfigChange() {
        this.color = this.colorControl.getColor();
        this.penMode = this.penModeSelect.value || 'standard';
        this.outputMode = this.outputModeSelect.value || 'path';
        this.strokeWidth = imageEditorClampNumber(parseInt(this.strokeNumber.value) || 1, 1, 64);
        this.curveTension = imageEditorClampNumber((parseInt(this.tensionNumber.value) || 100) / 100, 0.1, 2);
        this.refreshUiState();
        this.editor.redraw();
    }

    refreshUiState() {
        this.tensionBlock.style.display = this.penMode == 'curvature' ? '' : 'none';
        this.closeButton.innerText = this.closed ? 'Reopen Path' : 'Close Path';
    }

    createPoint(x, y) {
        return { x, y, inX: x, inY: y, outX: x, outY: y };
    }

    getMouseLayerPos() {
        let target = this.editor.activeLayer;
        if (!target) {
            return null;
        }
        return target.canvasCoordToLayerCoord(this.editor.mouseX, this.editor.mouseY);
    }

    getAnchorCanvasPos(point) {
        return this.editor.activeLayer.layerCoordToCanvasCoord(point.x, point.y);
    }

    getHandleCanvasPos(point, handleType) {
        if (handleType == 'in') {
            return this.editor.activeLayer.layerCoordToCanvasCoord(point.inX, point.inY);
        }
        return this.editor.activeLayer.layerCoordToCanvasCoord(point.outX, point.outY);
    }

    isPrimaryButton(e) {
        return e.button == 0 || e.button === undefined;
    }

    distSq(x1, y1, x2, y2) {
        let dx = x1 - x2;
        let dy = y1 - y2;
        return dx * dx + dy * dy;
    }

    findHitTarget() {
        if (!this.editor.activeLayer || this.points.length == 0) {
            return null;
        }
        let hitRadius = 7;
        let handleRadius = 6;
        let hitRadiusSq = hitRadius * hitRadius;
        let handleRadiusSq = handleRadius * handleRadius;
        if (this.penMode == 'standard') {
            for (let i = this.points.length - 1; i >= 0; i--) {
                let p = this.points[i];
                let inVisible = this.distSq(p.x, p.y, p.inX, p.inY) > 0.25;
                let outVisible = this.distSq(p.x, p.y, p.outX, p.outY) > 0.25;
                if (outVisible) {
                    let [hx, hy] = this.getHandleCanvasPos(p, 'out');
                    if (this.distSq(this.editor.mouseX, this.editor.mouseY, hx, hy) <= handleRadiusSq) {
                        return { type: 'handle-out', index: i };
                    }
                }
                if (inVisible) {
                    let [hx, hy] = this.getHandleCanvasPos(p, 'in');
                    if (this.distSq(this.editor.mouseX, this.editor.mouseY, hx, hy) <= handleRadiusSq) {
                        return { type: 'handle-in', index: i };
                    }
                }
            }
        }
        for (let i = this.points.length - 1; i >= 0; i--) {
            let p = this.points[i];
            let [ax, ay] = this.getAnchorCanvasPos(p);
            if (this.distSq(this.editor.mouseX, this.editor.mouseY, ax, ay) <= hitRadiusSq) {
                return { type: 'point', index: i };
            }
        }
        return null;
    }

    toggleClosedPath() {
        if (this.points.length < 3) {
            this.closed = false;
        }
        else {
            this.closed = !this.closed;
        }
        this.refreshUiState();
        this.editor.redraw();
    }

    undoPoint() {
        if (this.points.length == 0) {
            return;
        }
        this.points.pop();
        if (this.points.length < 3) {
            this.closed = false;
        }
        this.refreshUiState();
        this.editor.redraw();
    }

    clearPath() {
        this.points = [];
        this.closed = false;
        this.dragging = false;
        this.dragKind = null;
        this.dragIndex = -1;
        this.refreshUiState();
        this.editor.redraw();
    }

    getCurvatureControlPoints(i, j, closePath) {
        let points = this.points;
        let count = points.length;
        let prevIndex = i - 1;
        let nextNextIndex = j + 1;
        if (closePath) {
            prevIndex = (prevIndex + count) % count;
            nextNextIndex = nextNextIndex % count;
        }
        else {
            prevIndex = imageEditorClampNumber(prevIndex, 0, count - 1);
            nextNextIndex = imageEditorClampNumber(nextNextIndex, 0, count - 1);
        }
        let p0 = points[prevIndex];
        let p1 = points[i];
        let p2 = points[j];
        let p3 = points[nextNextIndex];
        let k = this.curveTension / 6;
        return {
            cp1x: p1.x + (p2.x - p0.x) * k,
            cp1y: p1.y + (p2.y - p0.y) * k,
            cp2x: p2.x - (p3.x - p1.x) * k,
            cp2y: p2.y - (p3.y - p1.y) * k
        };
    }

    tracePath(ctx, transformPoint, closePath) {
        if (this.points.length < 2) {
            return false;
        }
        let [startX, startY] = transformPoint(this.points[0].x, this.points[0].y);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        let segmentCount = closePath ? this.points.length : this.points.length - 1;
        for (let i = 0; i < segmentCount; i++) {
            let j = (i + 1) % this.points.length;
            let cp1x = 0, cp1y = 0, cp2x = 0, cp2y = 0;
            if (this.penMode == 'curvature') {
                let cp = this.getCurvatureControlPoints(i, j, closePath);
                cp1x = cp.cp1x;
                cp1y = cp.cp1y;
                cp2x = cp.cp2x;
                cp2y = cp.cp2y;
            }
            else {
                cp1x = this.points[i].outX;
                cp1y = this.points[i].outY;
                cp2x = this.points[j].inX;
                cp2y = this.points[j].inY;
            }
            let [tx1, ty1] = transformPoint(cp1x, cp1y);
            let [tx2, ty2] = transformPoint(cp2x, cp2y);
            let [toX, toY] = transformPoint(this.points[j].x, this.points[j].y);
            ctx.bezierCurveTo(tx1, ty1, tx2, ty2, toX, toY);
        }
        if (closePath) {
            ctx.closePath();
        }
        return true;
    }

    applyPath() {
        let target = this.editor.activeLayer;
        if (!target || this.points.length < 2) {
            return;
        }
        let doShape = this.outputMode == 'shape';
        if (doShape && this.points.length < 3) {
            return;
        }
        let closePath = this.closed || doShape;
        target.saveBeforeEdit();
        let ctx = target.ctx;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.setLineDash([]);
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = Math.max(1, Math.round(this.strokeWidth));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        let drew = this.tracePath(ctx, (x, y) => [x, y], closePath);
        if (drew) {
            if (doShape) {
                ctx.fill();
            }
            else {
                ctx.stroke();
            }
            target.hasAnyContent = true;
            this.editor.markChanged();
            this.closed = closePath;
            this.refreshUiState();
        }
        ctx.restore();
        this.editor.redraw();
    }

    drawPreviewPath() {
        if (!this.editor.activeLayer || this.points.length == 0) {
            return;
        }
        let ctx = this.editor.ctx;
        let closePath = this.closed || (this.outputMode == 'shape' && this.points.length >= 3);
        let drew = this.tracePath(ctx, (x, y) => this.editor.activeLayer.layerCoordToCanvasCoord(x, y), closePath);
        if (drew) {
            ctx.lineWidth = Math.max(1, this.strokeWidth * this.editor.zoomLevel);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = this.color;
            if (this.outputMode == 'shape') {
                ctx.fillStyle = this.color;
                ctx.save();
                ctx.globalAlpha = 0.2;
                ctx.fill();
                ctx.restore();
            }
            ctx.stroke();
        }
        if (!this.closed && this.points.length > 0 && this.editor.isMouseInBox(0, 0, this.editor.canvas.width, this.editor.canvas.height)) {
            let last = this.points[this.points.length - 1];
            let [startX, startY] = this.editor.activeLayer.layerCoordToCanvasCoord(last.x, last.y);
            ctx.save();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            if (this.penMode == 'standard') {
                let [cp1x, cp1y] = this.editor.activeLayer.layerCoordToCanvasCoord(last.outX, last.outY);
                ctx.moveTo(startX, startY);
                ctx.bezierCurveTo(cp1x, cp1y, this.editor.mouseX, this.editor.mouseY, this.editor.mouseX, this.editor.mouseY);
            }
            else {
                ctx.moveTo(startX, startY);
                ctx.lineTo(this.editor.mouseX, this.editor.mouseY);
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    drawAnchors() {
        if (!this.editor.activeLayer || this.points.length == 0) {
            return;
        }
        let ctx = this.editor.ctx;
        let showHandles = this.penMode == 'standard';
        if (showHandles) {
            for (let i = 0; i < this.points.length; i++) {
                let p = this.points[i];
                let [ax, ay] = this.editor.activeLayer.layerCoordToCanvasCoord(p.x, p.y);
                let [inX, inY] = this.editor.activeLayer.layerCoordToCanvasCoord(p.inX, p.inY);
                let [outX, outY] = this.editor.activeLayer.layerCoordToCanvasCoord(p.outX, p.outY);
                if (this.distSq(p.x, p.y, p.inX, p.inY) > 0.25) {
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(inX, inY);
                    ctx.stroke();
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = this.color;
                    ctx.fillRect(inX - 3, inY - 3, 6, 6);
                    ctx.strokeRect(inX - 3, inY - 3, 6, 6);
                }
                if (this.distSq(p.x, p.y, p.outX, p.outY) > 0.25) {
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(outX, outY);
                    ctx.stroke();
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = this.color;
                    ctx.fillRect(outX - 3, outY - 3, 6, 6);
                    ctx.strokeRect(outX - 3, outY - 3, 6, 6);
                }
            }
        }
        for (let i = 0; i < this.points.length; i++) {
            let p = this.points[i];
            let [ax, ay] = this.editor.activeLayer.layerCoordToCanvasCoord(p.x, p.y);
            let canClose = i == 0 && !this.closed && this.points.length >= 3;
            ctx.fillStyle = canClose ? '#ffffff' : this.color;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ax, ay, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    draw() {
        if (this.points.length == 0) {
            return;
        }
        this.editor.ctx.save();
        this.editor.ctx.imageSmoothingEnabled = true;
        this.editor.ctx.setLineDash([]);
        this.drawPreviewPath();
        this.drawAnchors();
        this.editor.ctx.restore();
    }

    onMouseDown(e) {
        if (!this.isPrimaryButton(e)) {
            return;
        }
        if (!this.editor.activeLayer) {
            return;
        }
        let layerPos = this.getMouseLayerPos();
        if (!layerPos) {
            return;
        }
        let [x, y] = layerPos;
        let hit = this.findHitTarget();
        if (hit) {
            if (hit.type == 'point' && hit.index == 0 && !this.closed && this.points.length >= 3 && !e.shiftKey) {
                this.closed = true;
                this.refreshUiState();
                this.editor.redraw();
                return;
            }
            this.dragging = true;
            this.dragKind = hit.type;
            this.dragIndex = hit.index;
            this.dragMoved = false;
            if (hit.type == 'point') {
                this.dragOffsetX = this.points[hit.index].x - x;
                this.dragOffsetY = this.points[hit.index].y - y;
            }
            return;
        }
        if (this.closed) {
            this.closed = false;
            this.refreshUiState();
        }
        this.points.push(this.createPoint(x, y));
        this.dragging = true;
        this.dragKind = 'new-point';
        this.dragIndex = this.points.length - 1;
        this.dragMoved = false;
        this.editor.redraw();
    }

    onMouseMove(e) {
        if (!this.dragging || !this.editor.activeLayer) {
            return;
        }
        let layerPos = this.getMouseLayerPos();
        if (!layerPos) {
            return;
        }
        let [x, y] = layerPos;
        let point = this.points[this.dragIndex];
        if (!point) {
            return;
        }
        if (this.dragKind == 'new-point') {
            if (this.penMode == 'curvature') {
                if (this.distSq(point.x, point.y, x, y) > 1) {
                    this.dragMoved = true;
                }
                point.x = x;
                point.y = y;
                point.inX = x;
                point.inY = y;
                point.outX = x;
                point.outY = y;
            }
            else {
                let dx = x - point.x;
                let dy = y - point.y;
                if (dx * dx + dy * dy > 1) {
                    this.dragMoved = true;
                }
                point.inX = point.x - dx;
                point.inY = point.y - dy;
                point.outX = point.x + dx;
                point.outY = point.y + dy;
            }
        }
        else if (this.dragKind == 'point') {
            let newX = x + this.dragOffsetX;
            let newY = y + this.dragOffsetY;
            let dx = newX - point.x;
            let dy = newY - point.y;
            if (dx * dx + dy * dy > 0) {
                this.dragMoved = true;
            }
            point.x = newX;
            point.y = newY;
            point.inX += dx;
            point.inY += dy;
            point.outX += dx;
            point.outY += dy;
        }
        else if (this.dragKind == 'handle-in') {
            this.dragMoved = true;
            point.inX = x;
            point.inY = y;
            if (!e.altKey) {
                point.outX = point.x + (point.x - x);
                point.outY = point.y + (point.y - y);
            }
        }
        else if (this.dragKind == 'handle-out') {
            this.dragMoved = true;
            point.outX = x;
            point.outY = y;
            if (!e.altKey) {
                point.inX = point.x + (point.x - x);
                point.inY = point.y + (point.y - y);
            }
        }
        this.editor.redraw();
    }

    finishDrag(e) {
        if (!this.dragging) {
            return;
        }
        if (this.dragKind == 'new-point' && this.penMode == 'standard' && !this.dragMoved) {
            let point = this.points[this.dragIndex];
            if (point) {
                point.inX = point.x;
                point.inY = point.y;
                point.outX = point.x;
                point.outY = point.y;
            }
        }
        this.dragging = false;
        this.dragKind = null;
        this.dragIndex = -1;
        this.dragMoved = false;
        if (e && e.detail >= 2 && this.points.length >= 2) {
            this.applyPath();
        }
        this.editor.redraw();
    }

    onMouseUp(e) {
        if (!this.isPrimaryButton(e)) {
            return;
        }
        this.finishDrag(e);
    }

    onGlobalMouseMove(e) {
        if (!this.dragging) {
            return false;
        }
        this.editor.updateMousePosFrom(e);
        this.onMouseMove(e);
        return true;
    }

    onGlobalMouseUp(e) {
        if (!this.dragging || !this.isPrimaryButton(e)) {
            return false;
        }
        this.finishDrag(e);
        return true;
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
        let [x2, y2] = this.editor.imageCoordToCanvasCoord(x, y);
        let [offsetX, offsetY] = this.getOffset();
        let relWidth = this.width / this.canvas.width;
        let relHeight = this.height / this.canvas.height;
        [x2, y2] = [x2 * relWidth + offsetX, y2 * relHeight + offsetY];
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
        this.addTool(new ImageEditorToolPen(this));
        this.addTool(new ImageEditorToolShape(this));
        this.pickerTool = new ImageEditorToolPicker(this, 'picker', 'paintbrush', 'Color Picker', 'Pick a color from the image.');
        this.addTool(this.pickerTool);
        this.activateTool('brush');
        this.maxHistory = 15;
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
        if (this.activeTool && !newTool.isTempTool) {
            this.activeTool.setInactive();
        }
        newTool.setActive();
        this.activeTool = newTool;
    }

    createCanvas() {
        let canvas = document.createElement('canvas');
        canvas.tabIndex = 1; // Force to be selectable
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
        canvas.addEventListener('keydown', (e) => this.onKeyDown(e));
        canvas.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('keydown', (e) => this.onGlobalKeyDown(e));
        document.addEventListener('keyup', (e) => this.onGlobalKeyUp(e));
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        canvas.addEventListener('drop', (e) => this.handleCanvasImageDrop(e));
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
            reader.onload = (e) => {
                let img = new Image();
                img.onload = () => {
                    this.addImageLayer(img);
                };
                img.src = e.target.result;
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

    onKeyDown(e) {
        if (e.key == 'Alt') {
            e.preventDefault();
            this.handleAltDown();
        }
        if (e.ctrlKey && e.key == 'z') {
            e.preventDefault();
            this.undoOnce();
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
    }

    deactivate() {
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
        this.activeLayer = layer;
        if (layer && layer.div) {
            layer.div.classList.add('image_editor_layer_preview-active');
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
    }

    removeLayer(layer) {
        let index = this.layers.indexOf(layer);
        if (index >= 0) {
            this.layers.splice(index, 1);
            this.canvasList.removeChild(layer.div);
            this.canvasList.removeChild(layer.menuPopover);
            if (this.activeLayer == layer) {
                this.setActiveLayer(this.layers[Math.max(0, index - 1)]);
            }
            this.redraw();
        }
    }

    addLayer(layer) {
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
        this.addLayer(layer);
        let layer2 = new ImageEditorLayer(this, img.naturalWidth, img.naturalHeight);
        this.addLayer(layer2);
        let maskLayer = new ImageEditorLayer(this, img.naturalWidth, img.naturalHeight);
        maskLayer.isMask = true;
        this.addLayer(maskLayer);
        this.realWidth = img.naturalWidth;
        this.realHeight = img.naturalHeight;
        this.offsetX = 0
        this.offsetY = 0;
        if (this.active) {
            this.autoZoom();
            this.redraw();
        }
    }

    doParamHides() {
        let initImage = document.getElementById('input_initimage');
        let maskImage = document.getElementById('input_maskimage');
        if (initImage) {
            initImage.dataset.has_data = 'true';
            let parent = findParentOfClass(initImage, 'auto-input');
            parent.style.display = 'none';
            parent.dataset.visible_controlled = 'true';
        }
        if (maskImage) {
            maskImage.dataset.has_data = 'true';
            let parent = findParentOfClass(maskImage, 'auto-input');
            parent.style.display = 'none';
            parent.dataset.visible_controlled = 'true';
        }
    }

    unhideParams() {
        let initImage = document.getElementById('input_initimage');
        let maskImage = document.getElementById('input_maskimage');
        if (initImage) {
            delete initImage.dataset.has_data;
            let parent = findParentOfClass(initImage, 'auto-input');
            parent.style.display = '';
            delete parent.dataset.visible_controlled;
        }
        if (maskImage) {
            delete maskImage.dataset.has_data;
            let parent = findParentOfClass(maskImage, 'auto-input');
            parent.style.display = '';
            delete parent.dataset.visible_controlled;
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

    drawSelectionBox(x, y, width, height, color, spacing, angle) {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.setLineDash([spacing, spacing]);
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
            this.drawSelectionBox(selectX, selectY, this.selectWidth * this.zoomLevel, this.selectHeight * this.zoomLevel, this.uiColor, 8 * this.zoomLevel, 0);
        }
        this.activeTool.draw();
        this.ctx.restore();
        for (let tool of Object.values(this.tools)) {
            if (tool.colorControl) {
                tool.colorControl.refreshFloatingPanel();
            }
        }
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
}
