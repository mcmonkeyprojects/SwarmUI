
/**
 * A full-featured color picker popup with HSV/RGB sliders, hex input, and a 2D saturation-value canvas.
 * Singleton usage: `colorPickerHelper.open(anchorElement, initialColor, onChange);`
 */
class ColorPickerHelper {
    constructor() {
        this.isOpen = false;
        this.onChange = null;
        this.anchorElement = null;
        this.grayscaleMode = false;
        this.currentH = 0;
        this.currentS = 1;
        this.currentV = 1;
        this.currentR = 255;
        this.currentG = 0;
        this.currentB = 0;
        this.svDragging = false;
        this.buildUI();
        this.bindGlobalEvents();
    }

    /** Converts a hex color string like '#ff0000' to an {r, g, b} object with 0-255 values. */
    hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length == 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    /** Converts RGB components (0-255 each) to a hex color string like '#ff0000'. */
    rgbToHex(r, g, b) {
        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    }

    /** Converts RGB (0-255 each) to HSV where H is 0-360 and S, V are 0-1. */
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        let max = Math.max(r, g, b);
        let min = Math.min(r, g, b);
        let delta = max - min;
        let h = 0;
        let s = max == 0 ? 0 : delta / max;
        let v = max;
        if (delta != 0) {
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
        if (h < 0) {
            h += 360;
        }
        return { h, s, v };
    }

    /** Converts HSV (H: 0-360, S: 0-1, V: 0-1) to RGB with 0-255 values. */
    hsvToRgb(h, s, v) {
        let c = v * s;
        let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        let m = v - c;
        let r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }

    /** Converts a hex color to its grayscale equivalent using luminance weighting. */
    hexToGrayscale(hex) {
        let rgb = this.hexToRgb(hex);
        let gray = Math.round(rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114);
        return this.rgbToHex(gray, gray, gray);
    }

    /** Builds the complete color picker popup DOM structure and appends it to the document body. */
    buildUI() {
        this.container = createDiv(null, 'color-picker-popup');
        this.container.style.display = 'none';
        this.svWrapper = createDiv(null, 'color-picker-sv-wrapper');
        this.svCanvas = document.createElement('canvas');
        this.svCanvas.className = 'color-picker-sv-canvas';
        this.svCanvas.width = 256;
        this.svCanvas.height = 256;
        this.svCtx = this.svCanvas.getContext('2d');
        this.svMarker = createDiv(null, 'color-picker-sv-marker');
        this.svWrapper.appendChild(this.svCanvas);
        this.svWrapper.appendChild(this.svMarker);
        this.container.appendChild(this.svWrapper);
        this.slidersDiv = createDiv(null, 'color-picker-sliders');
        this.sliders = {};
        let sliderDefs = [
            { key: 'h', label: 'H', min: 0, max: 360 },
            { key: 's', label: 'S', min: 0, max: 100 },
            { key: 'v', label: 'V', min: 0, max: 100 },
            { key: 'r', label: 'R', min: 0, max: 255 },
            { key: 'g', label: 'G', min: 0, max: 255 },
            { key: 'b', label: 'B', min: 0, max: 255 }
        ];
        for (let def of sliderDefs) {
            let row = createDiv(null, 'color-picker-slider-row');
            let label = document.createElement('label');
            label.className = 'color-picker-slider-label';
            label.textContent = def.label;
            let trackWrapper = createDiv(null, 'color-picker-slider-track-wrapper');
            let trackCanvas = document.createElement('canvas');
            trackCanvas.className = 'color-picker-slider-track';
            trackCanvas.width = 256;
            trackCanvas.height = 16;
            let handle = createDiv(null, 'color-picker-slider-handle');
            trackWrapper.appendChild(trackCanvas);
            trackWrapper.appendChild(handle);
            let numInput = document.createElement('input');
            numInput.type = 'number';
            numInput.className = 'color-picker-slider-number';
            numInput.min = def.min;
            numInput.max = def.max;
            numInput.step = 1;
            numInput.value = def.min;
            row.appendChild(label);
            row.appendChild(trackWrapper);
            row.appendChild(numInput);
            this.slidersDiv.appendChild(row);
            let slider = {
                key: def.key,
                min: def.min,
                max: def.max,
                canvas: trackCanvas,
                ctx: trackCanvas.getContext('2d'),
                handle: handle,
                input: numInput,
                wrapper: trackWrapper,
                row: row,
                dragging: false
            };
            this.sliders[def.key] = slider;
            trackWrapper.addEventListener('mousedown', (e) => {
                e.preventDefault();
                slider.dragging = true;
                this.handleSliderPointer(slider, e);
            });
            trackWrapper.addEventListener('touchstart', (e) => {
                e.preventDefault();
                slider.dragging = true;
                this.handleSliderPointer(slider, e.touches[0]);
            });
            numInput.addEventListener('change', () => {
                let val = parseInt(numInput.value);
                if (isNaN(val)) {
                    return;
                }
                val = Math.max(def.min, Math.min(def.max, val));
                this.applySliderValue(def.key, val);
            });
        }
        this.container.appendChild(this.slidersDiv);
        let bottomRow = createDiv(null, 'color-picker-bottom-row');
        let hexLabel = document.createElement('label');
        hexLabel.className = 'color-picker-hex-label';
        hexLabel.textContent = 'Hex:';
        this.hexInput = document.createElement('input');
        this.hexInput.type = 'text';
        this.hexInput.className = 'color-picker-hex-input';
        this.hexInput.value = '#ff0000';
        this.hexInput.maxLength = 7;
        this.previewSwatch = createDiv(null, 'color-picker-preview-swatch');
        this.okayButton = document.createElement('button');
        this.okayButton.className = 'basic-button color-picker-okay-button';
        this.okayButton.textContent = 'Okay';
        bottomRow.appendChild(hexLabel);
        bottomRow.appendChild(this.hexInput);
        bottomRow.appendChild(this.previewSwatch);
        bottomRow.appendChild(this.okayButton);
        this.container.appendChild(bottomRow);
        document.body.appendChild(this.container);
        this.svWrapper.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.svDragging = true;
            this.handleSvPointer(e);
        });
        this.svWrapper.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.svDragging = true;
            this.handleSvPointer(e.touches[0]);
        });
        this.hexInput.addEventListener('input', () => {
            this.applyHexInput();
        });
        this.hexInput.addEventListener('keydown', (e) => {
            if (e.key == 'Enter') {
                this.applyHexInput();
                this.close();
            }
        });
        this.okayButton.addEventListener('click', () => {
            this.close();
        });
    }

    /** Binds global document-level event listeners for drag tracking and click-outside-to-close. */
    bindGlobalEvents() {
        let endDrag = () => {
            this.svDragging = false;
            for (let key in this.sliders) {
                this.sliders[key].dragging = false;
            }
        };
        document.addEventListener('mousemove', (e) => {
            if (!this.isOpen) {
                return;
            }
            if (this.svDragging) {
                this.handleSvPointer(e);
            }
            for (let key in this.sliders) {
                if (this.sliders[key].dragging) {
                    this.handleSliderPointer(this.sliders[key], e);
                }
            }
        });
        document.addEventListener('touchmove', (e) => {
            if (!this.isOpen) {
                return;
            }
            if (this.svDragging) {
                this.handleSvPointer(e.touches[0]);
            }
            for (let key in this.sliders) {
                if (this.sliders[key].dragging) {
                    this.handleSliderPointer(this.sliders[key], e.touches[0]);
                }
            }
        });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
        let closeIfOutside = (target) => {
            if (this.isOpen && !this.container.contains(target) && (!this.anchorElement || !this.anchorElement.contains(target))) {
                this.close();
            }
        };
        document.addEventListener('mousedown', (e) => {
            closeIfOutside(e.target);
        });
        document.addEventListener('touchstart', (e) => {
            closeIfOutside(e.target);
        });
    }

    /** Reads the saturation/value position from a pointer event and updates color state. */
    handleSvPointer(e) {
        let rect = this.svCanvas.getBoundingClientRect();
        let x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        let y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        this.currentS = x;
        this.currentV = 1 - y;
        this.applyFromHsv();
    }

    /** Reads a slider value from a pointer event position and applies it. */
    handleSliderPointer(slider, e) {
        let rect = slider.wrapper.getBoundingClientRect();
        let fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        let val = Math.round(slider.min + fraction * (slider.max - slider.min));
        this.applySliderValue(slider.key, val);
    }

    /** Applies a changed slider value, recomputes the complementary color model, and refreshes the UI. */
    applySliderValue(key, val) {
        if (key == 'h' || key == 's' || key == 'v') {
            if (key == 'h') {
                this.currentH = val;
            }
            else if (key == 's') {
                this.currentS = val / 100;
            }
            else {
                this.currentV = val / 100;
            }
            let rgb = this.hsvToRgb(this.currentH, this.currentS, this.currentV);
            this.currentR = rgb.r;
            this.currentG = rgb.g;
            this.currentB = rgb.b;
        }
        else {
            if (key == 'r') {
                this.currentR = val;
            }
            else if (key == 'g') {
                this.currentG = val;
            }
            else {
                this.currentB = val;
            }
            let hsv = this.rgbToHsv(this.currentR, this.currentG, this.currentB);
            this.currentH = hsv.h;
            this.currentS = hsv.s;
            this.currentV = hsv.v;
        }
        this.enforceGrayscale();
        this.refreshUI();
        this.notifyChange();
    }

    /** Parses the hex input field and applies the color if valid, skipping hex field update to avoid cursor issues. */
    applyHexInput() {
        let hex = this.hexInput.value.trim();
        if (!hex.startsWith('#')) {
            hex = '#' + hex;
        }
        if (hex.length == 4) {
            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        if (hex.length != 7 || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
            return;
        }
        let rgb = this.hexToRgb(hex);
        if (this.grayscaleMode) {
            let gray = Math.round(rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114);
            rgb.r = gray;
            rgb.g = gray;
            rgb.b = gray;
        }
        this.currentR = rgb.r;
        this.currentG = rgb.g;
        this.currentB = rgb.b;
        let hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        this.currentH = hsv.h;
        this.currentS = hsv.s;
        this.currentV = hsv.v;
        this.enforceGrayscale();
        this.refreshUI(true);
        this.notifyChange();
    }

    /** Recalculates RGB from current HSV state and refreshes the UI. */
    applyFromHsv() {
        let rgb = this.hsvToRgb(this.currentH, this.currentS, this.currentV);
        this.currentR = rgb.r;
        this.currentG = rgb.g;
        this.currentB = rgb.b;
        this.enforceGrayscale();
        this.refreshUI();
        this.notifyChange();
    }

    /** Updates all UI elements (sliders, inputs, canvas, preview) to match the current color state. */
    refreshUI(skipHex = false) {
        this.sliders.h.input.value = Math.round(this.currentH);
        this.sliders.s.input.value = Math.round(this.currentS * 100);
        this.sliders.v.input.value = Math.round(this.currentV * 100);
        this.sliders.r.input.value = this.currentR;
        this.sliders.g.input.value = this.currentG;
        this.sliders.b.input.value = this.currentB;
        let hex = this.rgbToHex(this.currentR, this.currentG, this.currentB);
        if (!skipHex) {
            this.hexInput.value = hex;
        }
        this.previewSwatch.style.backgroundColor = hex;
        this.updateSliderHandles();
        this.drawSliderGradients();
        this.drawSvCanvas();
        this.updateSvMarker();
    }

    /** Draws the 2D saturation (X) / value (Y) canvas at the current hue. */
    drawSvCanvas() {
        let w = this.svCanvas.width;
        let h = this.svCanvas.height;
        let ctx = this.svCtx;
        let hueRgb = this.hsvToRgb(this.currentH, 1, 1);
        let hueColor = this.rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b);
        let gradH = ctx.createLinearGradient(0, 0, w, 0);
        gradH.addColorStop(0, '#ffffff');
        gradH.addColorStop(1, hueColor);
        ctx.fillStyle = gradH;
        ctx.fillRect(0, 0, w, h);
        let gradV = ctx.createLinearGradient(0, 0, 0, h);
        gradV.addColorStop(0, 'rgba(0,0,0,0)');
        gradV.addColorStop(1, '#000000');
        ctx.fillStyle = gradV;
        ctx.fillRect(0, 0, w, h);
    }

    /** Positions the SV marker circle based on current saturation and value. */
    updateSvMarker() {
        let x = this.currentS * 100;
        let y = (1 - this.currentV) * 100;
        this.svMarker.style.left = `${x}%`;
        this.svMarker.style.top = `${y}%`;
    }

    /** Draws the colored gradient on each slider track canvas to reflect current state. */
    drawSliderGradients() {
        this.drawSliderGradient(this.sliders.h, (frac) => {
            let rgb = this.hsvToRgb(frac * 360, 1, 1);
            return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        });
        this.drawSliderGradient(this.sliders.s, (frac) => {
            let rgb = this.hsvToRgb(this.currentH, frac, this.currentV);
            return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        });
        this.drawSliderGradient(this.sliders.v, (frac) => {
            let rgb = this.hsvToRgb(this.currentH, this.currentS, frac);
            return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
        });
        this.drawSliderGradient(this.sliders.r, (frac) => {
            let v = Math.round(frac * 255);
            if (this.grayscaleMode) {
                return `rgb(${v},${v},${v})`;
            }
            return `rgb(${v},${this.currentG},${this.currentB})`;
        });
        this.drawSliderGradient(this.sliders.g, (frac) => {
            return `rgb(${this.currentR},${Math.round(frac * 255)},${this.currentB})`;
        });
        this.drawSliderGradient(this.sliders.b, (frac) => {
            return `rgb(${this.currentR},${this.currentG},${Math.round(frac * 255)})`;
        });
    }

    /** Draws a single slider's gradient using the given color function that maps 0-1 fraction to a CSS color. */
    drawSliderGradient(slider, colorFn) {
        let ctx = slider.ctx;
        let w = slider.canvas.width;
        let h = slider.canvas.height;
        let grad = ctx.createLinearGradient(0, 0, w, 0);
        for (let i = 0; i <= 12; i++) {
            grad.addColorStop(i / 12, colorFn(i / 12));
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    /** Positions each slider handle based on the current color values. */
    updateSliderHandles() {
        this.setHandlePosition(this.sliders.h, this.currentH / 360);
        this.setHandlePosition(this.sliders.s, this.currentS);
        this.setHandlePosition(this.sliders.v, this.currentV);
        this.setHandlePosition(this.sliders.r, this.currentR / 255);
        this.setHandlePosition(this.sliders.g, this.currentG / 255);
        this.setHandlePosition(this.sliders.b, this.currentB / 255);
    }

    /** Sets a slider handle's left position as a 0-1 fraction of the track width. */
    setHandlePosition(slider, fraction) {
        slider.handle.style.left = `${fraction * 100}%`;
    }

    /** Fires the onChange callback with the current hex color string. */
    notifyChange() {
        if (this.onChange) {
            this.onChange(this.rgbToHex(this.currentR, this.currentG, this.currentB));
        }
    }

    /** Switches between full color mode and grayscale-only mode, showing/hiding UI elements accordingly. */
    setGrayscaleMode(grayscale) {
        this.grayscaleMode = grayscale;
        this.svWrapper.style.display = grayscale ? 'none' : '';
        let hideInGrayscale = ['h', 's', 'v', 'g', 'b'];
        for (let key of hideInGrayscale) {
            this.sliders[key].row.style.display = grayscale ? 'none' : '';
        }
        this.sliders.r.row.style.display = '';
        this.sliders.r.row.querySelector('.color-picker-slider-label').textContent = grayscale ? 'V' : 'R';
    }

    /** If in grayscale mode, forces R=G=B and S=0. Uses R as the authoritative channel value. */
    enforceGrayscale() {
        if (!this.grayscaleMode) {
            return;
        }
        let gray = this.currentR;
        this.currentG = gray;
        this.currentB = gray;
        this.currentH = 0;
        this.currentS = 0;
        this.currentV = gray / 255;
    }

    /** Opens the color picker popup positioned near the given anchor element. */
    open(anchorElement, initialColor, onChange, grayscale = false) {
        this.anchorElement = anchorElement;
        this.onChange = onChange;
        this.setGrayscaleMode(grayscale);
        if (grayscale) {
            initialColor = this.hexToGrayscale(initialColor);
        }
        let rgb = this.hexToRgb(initialColor);
        this.currentR = rgb.r;
        this.currentG = rgb.g;
        this.currentB = rgb.b;
        let hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        this.currentH = hsv.h;
        this.currentS = hsv.s;
        this.currentV = hsv.v;
        this.container.style.display = 'block';
        this.isOpen = true;
        this.refreshUI();
        let anchorRect = anchorElement.getBoundingClientRect();
        let containerWidth = this.container.offsetWidth;
        let containerHeight = this.container.offsetHeight;
        let left = anchorRect.left;
        let top = anchorRect.bottom + 4;
        if (left + containerWidth > window.innerWidth) {
            left = window.innerWidth - containerWidth - 8;
        }
        if (top + containerHeight > window.innerHeight) {
            top = anchorRect.top - containerHeight - 4;
        }
        this.container.style.left = `${Math.max(0, left)}px`;
        this.container.style.top = `${Math.max(0, top)}px`;
    }

    /** Closes the color picker popup and clears callbacks. */
    close() {
        if (!this.isOpen) {
            return;
        }
        this.isOpen = false;
        this.container.style.display = 'none';
        this.onChange = null;
        this.anchorElement = null;
    }

    /** Selects and focuses the hex input field within the popup. */
    focusHex() {
        this.hexInput.select();
        this.hexInput.focus();
    }

    /** Returns the current selected color as a hex string like '#ff0000'. */
    getCurrentColor() {
        return this.rgbToHex(this.currentR, this.currentG, this.currentB);
    }
}

let colorPickerHelper = new ColorPickerHelper();
