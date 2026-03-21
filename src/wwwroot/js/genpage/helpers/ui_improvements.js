
let mouseX, mouseY;
let popHide = [];
let lastPopoverTime = 0, lastPopover = null;

class AdvancedPopover {
    /**
     * eg: new AdvancedPopover('my_popover_name', [ { key: 'Button 1', action: () => console.log("Clicked!") } ], true, mouseX, mouseY, document.body, null);
     * Buttons can optionally exclude action to make unclickable.
     */
    constructor(id, buttons, canSearch, x, y, root, preSelect = null, flipYHeight = null, heightLimit = 999999, canSelect = true) {
        this.id = id;
        this.buttons = buttons;
        this.popover = createDiv(`popover_${id}`, 'sui-popover sui_popover_model sui-popover-notransition');
        this.textInput = null;
        this.flipYHeight = flipYHeight;
        this.preSelect = preSelect;
        this.heightLimit = heightLimit;
        this.overExtendBy = 24;
        this.canSelect = canSelect;
        if (canSearch) {
            this.textInput = document.createElement('input');
            this.textInput.type = 'text';
            this.textInput.classList.add('sui_popover_text_input');
            this.textInput.value = '';
            this.textInput.placeholder = 'Search...';
            this.textInput.addEventListener('input', (e) => {
                this.buildList();
                this.optionArea.style.width = (this.optionArea.offsetWidth + this.overExtendBy) + 'px';
            });
            this.textInput.addEventListener('keydown', (e) => {
                this.onKeyDown(e);
            });
            this.popover.appendChild(this.textInput);
        }
        this.optionArea = createDiv(null, 'sui_popover_scrollable_tall');
        this.expectedHeight = 0;
        this.targetY = null;
        this.blockHeight = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.3;
        this.buildList();
        this.popover.appendChild(this.optionArea);
        root.appendChild(this.popover);
        this.show(x, y);
        if (canSearch) {
            this.textInput.focus();
        }
        this.created = Date.now();
        this.optionArea.style.width = (this.optionArea.offsetWidth + this.overExtendBy) + 'px';
    }

    remove() {
        if (this.popover) {
            this.hide();
            this.popover.remove();
            this.popover = null;
        }
    }

    buildList() {
        let selectedElem = this.selected();
        let selected = this.preSelect ? this.preSelect : selectedElem ? selectedElem.innerText : null;
        let scroll = this.optionArea.scrollTop;
        this.optionArea.innerHTML = '';
        let searchText = this.textInput ? this.textInput.value.toLowerCase() : '';
        let didSelect = false;
        this.expectedHeight = 0;
        this.optionArea.style.width = '';
        for (let button of this.buttons) {
            if ((button.searchable || button.key).toLowerCase().includes(searchText)) {
                let optionDiv = document.createElement(button.href ? 'a' : 'div');
                optionDiv.classList.add('sui_popover_model_button');
                if (button.key_html) {
                    optionDiv.innerHTML = button.key_html;
                }
                else {
                    optionDiv.innerText = button.key;
                }
                if (button.title) {
                    optionDiv.title = button.title;
                }
                if (button.key == selected) {
                    optionDiv.classList.add('sui_popover_model_button_selected');
                    didSelect = true;
                }
                if (button.href) {
                    optionDiv.href = button.href;
                    if (button.is_download) {
                        optionDiv.download = '';
                    }
                }
                else if (!button.action) {
                    optionDiv.classList.add('sui_popover_model_button_disabled');
                }
                else {
                    optionDiv.addEventListener('click', () => {
                        button.action();
                        this.remove();
                    });
                }
                if (button.className) {
                    for (let className of button.className.split(' ')) {
                        optionDiv.classList.add(className);
                    }
                }
                this.optionArea.appendChild(optionDiv);
                this.expectedHeight += this.blockHeight;
            }
        }
        if (!didSelect && this.canSelect) {
            let selected = this.optionArea.querySelector('.sui_popover_model_button');
            if (selected) {
                selected.classList.add('sui_popover_model_button_selected');
            }
        }
        this.optionArea.scrollTop = scroll;
        this.scrollFix();
        if (this.targetY != null) {
            this.reposition();
        }
    }

    selected() {
        if (!this.popover) {
            return [];
        }
        return this.popover.getElementsByClassName('sui_popover_model_button_selected')[0];
    }

    scrollFix() {
        let selected = this.selected();
        if (!selected) {
            return;
        }
        if (selected.offsetTop + selected.offsetHeight > this.optionArea.scrollTop + this.optionArea.offsetHeight) {
            this.optionArea.scrollTop = selected.offsetTop + selected.offsetHeight - this.optionArea.offsetHeight + 6;
        }
        else if (selected.offsetTop < this.optionArea.scrollTop) {
            this.optionArea.scrollTop = selected.offsetTop;
        }
    }

    possible() {
        if (!this.popover) {
            return [];
        }
        return [...this.popover.getElementsByClassName('sui_popover_model_button')].filter(e => !e.classList.contains('sui_popover_model_button_disabled'));
    }

    onKeyDown(e) {
        if (e.shiftKey || e.ctrlKey) {
            return true;
        }
        let possible = this.possible();
        if (!possible) {
            return true;
        }
        if (e.key == 'Escape') {
            this.remove();
        }
        else if (e.key == 'Tab' || e.key == 'Enter') {
            let selected = this.popover.querySelector('.sui_popover_model_button_selected');
            if (selected) {
                this.hide();
                selected.click();
            }
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        else if (e.key == 'ArrowUp') {
            let selectedIndex = possible.findIndex(e => e.classList.contains('sui_popover_model_button_selected'));
            if (selectedIndex == -1) {
                selectedIndex = 0;
            }
            possible[selectedIndex].classList.remove('sui_popover_model_button_selected');
            possible[(selectedIndex + possible.length - 1) % possible.length].classList.add('sui_popover_model_button_selected');
            this.scrollFix();
        }
        else if (e.key == 'ArrowDown') {
            let selectedIndex = possible.findIndex(e => e.classList.contains('sui_popover_model_button_selected'));
            if (selectedIndex == -1) {
                selectedIndex = 0;
            }
            possible[selectedIndex].classList.remove('sui_popover_model_button_selected');
            possible[(selectedIndex + 1) % possible.length].classList.add('sui_popover_model_button_selected');
            this.scrollFix();
        }
        else {
            return true;
        }
        e.preventDefault();
        return false;
    }

    hide() {
        if (this.popover.dataset.visible == "true") {
            this.popover.classList.remove('sui-popover-visible');
            this.popover.dataset.visible = "false";
            popHide.splice(popHide.indexOf(this), 1);
        }
    }

    isHidden() {
        return this.popover.dataset.visible != "true";
    }

    reposition() {
        if (this.popover.classList.contains('sui_popover_reverse')) {
            this.popover.classList.remove('sui_popover_reverse');
        }
        let y;
        let maxHeight;
        let extraHeight = (this.textInput ? this.textInput.offsetHeight : 0) + 32;
        let rawExpected = Math.min(this.expectedHeight, this.heightLimit);
        let expected = rawExpected + extraHeight;
        if (this.targetY + expected < window.innerHeight) {
            y = this.targetY;
            maxHeight = rawExpected;
        }
        else if (this.flipYHeight != null && this.targetY > window.innerHeight / 2) {
            y = Math.max(0, this.targetY - this.flipYHeight - expected);
            this.popover.classList.add('sui_popover_reverse');
            maxHeight = Math.min(this.targetY - this.flipYHeight - 32, rawExpected);
        }
        else {
            y = this.targetY;
            maxHeight = window.innerHeight - y - extraHeight - 10;
        }
        this.popover.style.top = `${y}px`;
        this.optionArea.style.maxHeight = `${maxHeight}px`;
    }

    show(targetX, targetY) {
        this.targetY = targetY;
        if (this.popover.dataset.visible == "true") {
            this.hide();
        }
        this.popover.classList.add('sui-popover-visible');
        this.popover.style.width = '200px';
        this.popover.dataset.visible = "true";
        let x = Math.min(targetX, window.innerWidth - this.popover.offsetWidth - 10);
        let y = Math.min(targetY, window.innerHeight - this.popover.offsetHeight);
        this.popover.style.left = `${x}px`;
        this.popover.style.top = `${y}px`;
        this.popover.style.width = '';
        this.reposition();
        popHide.push(this);
        lastPopoverTime = Date.now();
        lastPopover = this;
    }
}

class UIImprovementHandler {
    constructor() {
        this.lastPopover = null;
        this.lastShift = false;
        this.lastSelectedTextbox = null;
        this.timeOfLastTextboxSelectTrack = 0;
        this.lastTextboxCursorPos = -1;
        this.videoControlDragging = null;
        this.sustainPopover = null;
        document.addEventListener('click', e => {
            if (this.sustainPopover && !this.sustainPopover.contains(e.target)) {
                this.sustainPopover.remove();
                this.sustainPopover = null;
            }
        });
        document.addEventListener('contextmenu', e => {
            if (this.sustainPopover && !this.sustainPopover.contains(e.target)) {
                this.sustainPopover.remove();
                this.sustainPopover = null;
            }
        });
        document.addEventListener('keydown', e => {
            if (this.sustainPopover && e.key == 'Escape') {
                this.sustainPopover.remove();
                this.sustainPopover = null;
            }
        });
        document.addEventListener('mousemove', (e) => {
            if (this.videoControlDragging) {
                this.videoControlDragging.drag(e);
            }
        });
        document.addEventListener('mouseup', () => {
            if (this.videoControlDragging) {
                this.videoControlDragging.isDragging = false;
                this.videoControlDragging = null;
            }
        });
        document.addEventListener('pointerup', () => {
            if (this.videoControlDragging) {
                this.videoControlDragging.isDragging = false;
                this.videoControlDragging = null;
            }
        });
        document.addEventListener('pointercancel', () => {
            if (this.videoControlDragging) {
                this.videoControlDragging.isDragging = false;
                this.videoControlDragging = null;
            }
        });
        document.addEventListener('focusout', (e) => {
            if (e.target.tagName == 'TEXTAREA') {
                this.lastSelectedTextbox = e.target;
                this.timeOfLastTextboxSelectTrack = Date.now();
                this.lastTextboxCursorPos = e.target.selectionEnd;
            }
        }, true);
        document.addEventListener('mousedown', (e) => {
            this.lastShift = e.shiftKey;
            if (e.target.tagName == 'SELECT') {
                if (!this.lastShift && this.shouldAlterSelect(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }
        }, true);
        document.addEventListener('click', (e) => {
            if (e.target.tagName == 'SELECT' && !this.lastShift && this.shouldAlterSelect(e.target)) { // e.shiftKey doesn't work in click for some reason
                // The tiny delay is to try to fight broken browser extensions that spazz out when elements are spawned from a click
                // (eg 1Password, Eno Capital One, iCloud Passwords are known offenders)
                setTimeout(() => {
                    this.onSelectClicked(e.target, e);
                }, 1);
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, true);
        document.addEventListener('mouseup', (e) => {
            if (e.target.tagName == 'SELECT' && !e.shiftKey && this.shouldAlterSelect(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, true);
        function updateVal(input, newVal, step) {
            let min = parseFloat(input.min);
            if (typeof min == 'number' && !isNaN(min)) {
                newVal = Math.max(newVal, min);
            }
            let max = parseFloat(input.max);
            if (typeof max == 'number' && !isNaN(max)) {
                newVal = Math.min(newVal, max);
            }
            input.value = roundToStrAuto(newVal, step);
            triggerChangeFor(input);
        }
        window.addEventListener('wheel', (e) => {
            if (!e.target || !e.target.matches(':focus')) {
                return;
            }
            if (e.target.tagName == 'INPUT' && (e.target.type == 'number' || e.target.type == 'range')) {
                let input = e.target;
                let step = parseFloat(input.step);
                if (typeof step != 'number' || isNaN(step)) {
                    step = 1;
                }
                let value = parseFloat(input.value) || 0;
                if (e.deltaY > 0) {
                    updateVal(input, value - step, step);
                }
                else if (e.deltaY < 0) {
                    updateVal(input, value + step, step);
                }
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, {capture:true, passive:false});
        let lastX = 0, lastY = 0;
        let stepDist = 10;
        let clickedElem = null;
        window.addEventListener('mousemove', (e) => {
            if (clickedElem) {
                if (e.buttons != 1) {
                    clickedElem.style.cursor = '';
                    return;
                }
                clickedElem.style.cursor = 'ew-resize';
                if (lastX == 0 && lastY == 0) {
                    lastX = e.pageX;
                    lastY = e.pageY;
                    return;
                }
                let moveX = e.pageX - lastX;
                let moveY = e.pageY - lastY;
                if (Math.abs(moveX) < stepDist && Math.abs(moveY) < stepDist) {
                    return;
                }
                moveX = Math.round(moveX / stepDist);
                moveY = Math.round(moveY / stepDist);
                lastX = e.pageX;
                lastY = e.pageY;
                let step = parseFloat(clickedElem.step);
                if (typeof step != 'number' || isNaN(step)) {
                    step = 1;
                }
                let value = parseFloat(clickedElem.value) || 0;
                let newVal = value + (moveX - moveY) * step;
                updateVal(clickedElem, newVal, step);
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, {capture:true, passive:false});
        window.addEventListener('mousedown', (e) => {
            clickedElem = null;
            if (e.target.tagName == 'INPUT' && e.target.type == 'number') {
                lastX = 0;
                lastY = 0;
                clickedElem = e.target;
            }
        }, true);
        window.addEventListener('mouseup', (e) => {
            clickedElem = null;
            if (e.target.tagName == 'INPUT' && e.target.type == 'number') {
                e.target.style.cursor = '';
                lastX = 0;
                lastY = 0;
            }
        }, true);
        let isDoingADrag = false;
        document.addEventListener('dragenter', (e) => {
            if (isDoingADrag) {
                return;
            }
            isDoingADrag = true;
            let files = this.getFileList(e.dataTransfer, e);
            if (files.length > 0 && files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type == 'application/json').length > 0) {
                let targets = document.getElementsByClassName('drag_image_target');
                for (let target of targets) {
                    target.classList.add('drag_image_target_highlight');
                }
            }
        }, true);
        function clearDrag() {
            setTimeout(() => {
                isDoingADrag = false;
                let targets = document.getElementsByClassName('drag_image_target'); // intentionally don't search "_highlight" due to browse misbehavior
                for (let target of targets) {
                    target.classList.remove('drag_image_target_highlight');
                }
            }, 1);
        }
        document.addEventListener('drop', (e) => {
            clearDrag();
        }, true);
        document.addEventListener('dragleave', (e) => {
            if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                clearDrag();
            }
        }, true);
        window.addEventListener('mousemove', (e) => {
            if (isDoingADrag && e.buttons == 0) {
                clearDrag();
            }
        }, true);
    }

    /** Returns a list of files from the given dataTransfer object, auto-correcting for browsers inconsistently handling certain drag types. */
    getFileList(dataTransfer, e) {
        if (!dataTransfer) {
            return [];
        }
        let files = dataTransfer.files;
        if (!files || !files.length) {
            files = [...dataTransfer.items || []].filter(item => item.kind == "file");
        }
        if (!files.length) {
            let uris = dataTransfer.getData('text/uri-list');
            if (uris) {
                files = uris.split('\n');
            }
            files = files.map(f => new File([f], f, {type: guessMimeTypeForExtension(f)}));
        }
        if (!files.length && e && e.srcElement) {
            let img = e.srcElement;
            if (img.tagName == 'IMG') {
                files = [new File([img.src], img.src, {type: guessMimeTypeForExtension(img.src)})];
            }
        }
        return files;
    }

    getLastSelectedTextbox() {
        let now = Date.now();
        if (now - this.timeOfLastTextboxSelectTrack > 1000) {
            return [null, -1];
        }
        return [this.lastSelectedTextbox, this.lastTextboxCursorPos];
    }

    shouldAlterSelect(elem) {
        if (elem.options.length > 1) {
            return true;
        }
        if ([... elem.options].filter(o => o.innerText.includes('(')).length > 0) {
            return true;
        }
        return false;
    }

    onSelectClicked(elem, e) {
        if (this.lastPopover && this.lastPopover.popover) {
            this.lastPopover.remove();
            this.lastPopover = null;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        let popId = `uiimprover_${elem.id}`;
        let rect = elem.getBoundingClientRect();
        let buttons = [...elem.options].filter(o => o.style.display != 'none').map(o => { return { key_html: o.dataset.cleanname, title: o.title, key: o.innerText, searchable: `${o.dataset.cleanname} ${o.innerText} ${o.value}`, action: () => { elem.value = o.value; triggerChangeFor(elem); } }; })
        this.lastPopover = new AdvancedPopover(popId, buttons, true, rect.x, rect.y, elem.parentElement, elem.selectedIndex < 0 ? null : elem.selectedOptions[0].innerText, 0);
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    /** This used to be a CSS Animation, but browsers try so hard to make those pretty and smooth that it makes a noticeable GPU perf impact. Ow. */
    runLoadSpinner(div) {
        if (div.dataset.is_spinner_going) {
            return;
        }
        div.dataset.is_spinner_going = 'true';
        setTimeout(() => {
            let s1 = div.querySelector('.loadspin1');
            if (!s1) {
                return;
            }
            let s2 = div.querySelector('.loadspin2');
            let s3 = div.querySelector('.loadspin3');
            let interval;
            let time = 0;
            let step = 0.05;
            interval = setInterval(() => {
                if (!div.isConnected || div.style.display == 'none' || !s1) {
                    clearInterval(interval);
                    delete div.dataset.is_spinner_going;
                    return;
                }
                time += step;
                s1.style.transform = `rotate(${((time - 0.45) / 1.2) * 360}deg)`;
                s2.style.transform = `rotate(${((time - 0.3) / 1.2) * 360}deg)`;
                s3.style.transform = `rotate(${((time - 0.15) / 1.2) * 360}deg)`;
            }, step * 1000);
        }, 100);
    }
}

uiImprover = new UIImprovementHandler();

/** Helper class to inject custom JS video controls to a 'video' element. */
class VideoControls {

    constructor(videoElement) {
        this.video = videoElement;
        this.isDragging = false;
        this.createControls();
    }

    /** Creates the controls UI for the video. */
    createControls() {
        let container = this.video.parentElement;
        let controls = createDiv(null, 'video-controls', `
            <button data-action="play">▶</button>
            <span class="video-time">0:00</span>
            <div class="video-progress"><div class="video-progress-inner"><div></div></div></div>
            <span class="video-time">0:00</span>
            <button data-action="volume">🔊</button>
            <div class="auto-slider-range-wrapper" style="${getRangeStyle(100, 0, 100)}; width: 80px;">
                <input class="auto-slider-range" type="range" value="100" min="0" max="100" step="1" data-ispot="false" autocomplete="off" oninput="updateRangeStyle(this)" onchange="updateRangeStyle(this)">
            </div>
        `);
        container.appendChild(controls);
        this.controls = controls;
        this.playBtn = controls.querySelector('[data-action="play"]');
        this.volumeBtn = controls.querySelector('[data-action="volume"]');
        this.currentTimeEl = controls.querySelectorAll('.video-time')[0];
        this.durationEl = controls.querySelectorAll('.video-time')[1];
        this.progressBar = controls.querySelector('.video-progress');
        this.progressBarInner = this.progressBar.querySelector('.video-progress-inner');
        this.progressFilled = this.progressBarInner.querySelector('div');
        this.volumeSlider = controls.querySelector('input[type="range"]');
        this.volumeSlider.dataset.lastRealVolume = "100";
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.video.addEventListener('timeupdate', () => this.updateProgress());
        this.video.addEventListener('loadedmetadata', () => this.updateDuration());
        this.video.addEventListener('play', () => this.updateIcons());
        this.video.addEventListener('pause', () => this.updateIcons());
        container.addEventListener('mouseenter', () => { controls.style.opacity = 1; });
        container.addEventListener('mouseleave', () => { controls.style.opacity = 0; });
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        this.progressBar.addEventListener('mousedown', () => { this.isDragging = true; uiImprover.videoControlDragging = this; });
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e));
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        let userSetting = typeof getUserSetting == 'function' ? getUserSetting('audio.videoaudiobehavior', 'last') : 'play';
        if (userSetting == 'play') {
            this.video.muted = false;
        }
        else if (userSetting == 'silent') {
            this.volumeSlider.value = 0;
            this.volumeSlider.dataset.lastRealVolume = "0";
            this.video.volume = 0;
            this.video.muted = true;
        }
        else { // Remember last
            let lastVolume = localStorage.getItem('audiovolume_last') || "100";
            let lastMuted = localStorage.getItem('audiovolume_lastmuted') == "true";
            this.volumeSlider.value = lastMuted ? 0 : parseFloat(lastVolume);
            this.volumeSlider.dataset.lastRealVolume = lastVolume;
            this.video.volume = parseFloat(lastVolume) / 100;
            this.video.muted = lastMuted;
        }
        this.updateIcons();
        this.video.draggable = true;
        this.video.addEventListener('dragstart', (e) => {
            let src = this.video.currentSrc || this.video.src;
            if (src) {
                chromeIsDumbFileHack(e.dataTransfer.files[0], src);
                e.dataTransfer.clearData();
                e.dataTransfer.setData('text/uri-list', src);
            }
        });
    }

    /** Helper to format a time in seconds into a MM:SS string. */
    formatTime(seconds) {
        let mins = Math.floor(seconds / 60);
        let secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /** Toggles the play/pause state of the video. */
    togglePlay() {
        if (this.video.paused) {
            this.video.play();
        }
        else {
            this.video.pause();
        }
        this.updateIcons();
    }

    /** Updates the progress bar to match the video. */
    updateProgress() {
        let percent = (this.video.currentTime / this.video.duration) * 100;
        this.progressFilled.style.width = `${percent}%`;
        this.currentTimeEl.textContent = this.formatTime(this.video.currentTime);
    }

    /** Updates the duration UI text to match the video. */
    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.video.duration);
    }

    /** Seeks the video to a specific time based on a click event on the progress bar. */
    seek(e) {
        let rect = this.progressBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        this.video.currentTime = percent * this.video.duration;
    }

    /** Handles the dragging of the progress bar to seek the video. */
    drag(e) {
        if (!this.isDragging) {
            return;
        }
        let rect = this.progressBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        this.video.currentTime = percent * this.video.duration;
    }

    /** Sets the volume of the video explicitly based on a slider event. */
    setVolume(e) {
        let volume = e.target.value / 100;
        e.target.dataset.lastRealVolume = `${e.target.value}`;
        this.video.volume = volume;
        this.video.muted = volume < 0.001;
        localStorage.setItem('audiovolume_last', `${e.target.value}`);
        localStorage.setItem('audiovolume_lastmuted', `${this.video.muted}`);
        this.updateIcons();
    }

    /** Toggles the mute state of the video. */
    toggleMute() {
        this.video.muted = !this.video.muted;
        if (this.video.muted) {
            this.volumeSlider.value = 0;
        }
        else if (this.volumeSlider.dataset.lastRealVolume) {
            this.video.volume = parseFloat(this.volumeSlider.dataset.lastRealVolume) / 100;
            if (this.video.volume < 0.01) {
                this.video.volume = 0.5;
            }
        }
        localStorage.setItem('audiovolume_lastmuted', `${this.video.muted}`);
        this.updateIcons();
    }

    /** Updates the icons for the play and volume buttons. */
    updateIcons() {
        let volume = this.video.muted ? 0 : this.video.volume;
        this.volumeSlider.value = volume * 100;
        updateRangeStyle(this.volumeSlider);
        if (volume == 0) {
            this.volumeBtn.textContent = '🔇';
        }
        else if (volume < 0.5) {
            this.volumeBtn.textContent = '🔉';
        }
        else {
            this.volumeBtn.textContent = '🔊';
        }
        if (this.video.paused) {
            this.playBtn.textContent = '▶';
        }
        else {
            this.playBtn.textContent = '⏸';
        }
    }
}

/** Helper class to inject custom JS audio controls (with waveform) on an 'audio' element. Expects audio inside an `.audio-container` parent. */
class AudioControls {

    constructor(audioElement) {
        this.audio = audioElement;
        this.isDragging = false;
        this.peaks = null;
        this.waveformFailed = false;
        this.resizeObserver = null;
        this.hoverFraction = null;
        this.pointerIdForScrub = null;
        this.progressRaf = null;
        this.createControls();
        this.loadWaveform();
    }

    /** Creates the controls UI and waveform canvas. */
    createControls() {
        let container = this.audio.parentElement;
        this.waveformWrap = createDiv(null, 'audio-waveform-wrap', `
            <canvas class="audio-waveform-canvas" width="400" height="72"></canvas>
        `);
        container.appendChild(this.waveformWrap);
        this.canvas = this.waveformWrap.querySelector('.audio-waveform-canvas');
        let controls = createDiv(null, 'audio-controls', `
            <button data-action="play">▶</button>
            <span class="audio-time">0:00</span>
            <span class="audio-toolbar-spacer"></span>
            <span class="audio-time audio-time-duration">0:00</span>
            <button data-action="volume">🔊</button>
            <div class="auto-slider-range-wrapper" style="${getRangeStyle(100, 0, 100)}; width: 80px;">
                <input class="auto-slider-range" type="range" value="100" min="0" max="100" step="1" data-ispot="false" autocomplete="off" oninput="updateRangeStyle(this)" onchange="updateRangeStyle(this)">
            </div>
        `);
        container.appendChild(controls);
        this.controls = controls;
        this.playBtn = controls.querySelector('[data-action="play"]');
        this.volumeBtn = controls.querySelector('[data-action="volume"]');
        this.currentTimeEl = controls.querySelectorAll('.audio-time')[0];
        this.durationEl = controls.querySelector('.audio-time-duration');
        this.volumeSlider = controls.querySelector('input[type="range"]');
        this.volumeSlider.dataset.lastRealVolume = "100";
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('seeked', () => this.refreshProgressDisplay());
        this.audio.addEventListener('play', () => {
            this.updateIcons();
            this.startProgressAnimation();
        });
        this.audio.addEventListener('pause', () => {
            this.updateIcons();
            this.stopProgressAnimation();
            this.refreshProgressDisplay();
        });
        this.audio.addEventListener('ended', () => {
            this.updateIcons();
            this.stopProgressAnimation();
            this.refreshProgressDisplay();
        });
        this.waveformWrap.addEventListener('pointermove', (e) => {
            if (this.isDragging) {
                this.seekToClientX(e.clientX);
                this.redrawWaveform();
            }
            else if (e.buttons == 0) {
                this.setHoverFromClientX(e.clientX);
            }
        });
        this.waveformWrap.addEventListener('pointerleave', () => {
            if (!this.isDragging) {
                this.hoverFraction = null;
                this.redrawWaveform();
            }
        });
        this.waveformWrap.addEventListener('pointerdown', (e) => {
            if (e.button != 0) {
                return;
            }
            e.preventDefault();
            this.isDragging = true;
            uiImprover.videoControlDragging = this;
            this.pointerIdForScrub = e.pointerId;
            try {
                this.waveformWrap.setPointerCapture(e.pointerId);
            }
            catch (err) {
            }
            this.seekToClientX(e.clientX);
            this.redrawWaveform();
        });
        this.waveformWrap.addEventListener('pointerup', (e) => {
            if (e.pointerId != this.pointerIdForScrub) {
                return;
            }
            try {
                this.waveformWrap.releasePointerCapture(e.pointerId);
            }
            catch (err) {
            }
            this.finishScrubIfActive();
        });
        this.waveformWrap.addEventListener('pointercancel', (e) => {
            if (e.pointerId != this.pointerIdForScrub) {
                return;
            }
            try {
                this.waveformWrap.releasePointerCapture(e.pointerId);
            }
            catch (err) {
            }
            this.finishScrubIfActive();
        });
        this.waveformWrap.addEventListener('lostpointercapture', () => {
            this.finishScrubIfActive();
        });
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e));
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        let userSetting = typeof getUserSetting == 'function' ? getUserSetting('audio.videoaudiobehavior', 'last') : 'play';
        if (userSetting == 'play') {
            this.audio.muted = false;
        }
        else if (userSetting == 'silent') {
            this.volumeSlider.value = 0;
            this.volumeSlider.dataset.lastRealVolume = "0";
            this.audio.volume = 0;
            this.audio.muted = true;
        }
        else {
            let lastVolume = localStorage.getItem('audiovolume_last') || "100";
            let lastMuted = localStorage.getItem('audiovolume_lastmuted') == "true";
            this.volumeSlider.value = lastMuted ? 0 : parseFloat(lastVolume);
            this.volumeSlider.dataset.lastRealVolume = lastVolume;
            this.audio.volume = parseFloat(lastVolume) / 100;
            this.audio.muted = lastMuted;
        }
        this.updateIcons();
        if (typeof ResizeObserver != 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.redrawWaveform());
            this.resizeObserver.observe(this.waveformWrap);
        }
    }

    /** Fetches and decodes audio to build peak data for the waveform. */
    loadWaveform() {
        let src = this.audio.currentSrc || this.audio.src;
        if (!src) {
            this.waveformFailed = true;
            this.redrawWaveform();
            return;
        }
        let tryDecode = (arrayBuffer) => {
            let Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) {
                this.waveformFailed = true;
                this.redrawWaveform();
                return;
            }
            if (!this.audioContext) {
                this.audioContext = new Ctx();
            }
            this.audioContext.decodeAudioData(arrayBuffer.slice(0), (buffer) => {
                if (!this.audio.isConnected) {
                    return;
                }
                this.buildPeaksFromBuffer(buffer);
                this.redrawWaveform();
            }, () => {
                this.waveformFailed = true;
                this.redrawWaveform();
            });
        };
        fetch(src, { credentials: 'same-origin' }).then((r) => {
            if (!r.ok) {
                throw new Error('fetch failed');
            }
            return r.arrayBuffer();
        }).then(tryDecode).catch(() => {
            this.waveformFailed = true;
            this.redrawWaveform();
        });
    }

    /** Downsamples decoded PCM to peak envelopes for drawing. */
    buildPeaksFromBuffer(buffer) {
        let numChannels = buffer.numberOfChannels;
        if (numChannels < 1) {
            this.waveformFailed = true;
            return;
        }
        let len = buffer.length;
        let targetBars = 600;
        let blockSize = Math.max(1, Math.floor(len / targetBars));
        let numBars = Math.ceil(len / blockSize);
        let peaks = [];
        for (let i = 0; i < numBars; i++) {
            let start = i * blockSize;
            let end = Math.min(start + blockSize, len);
            let peak = 0;
            for (let c = 0; c < numChannels; c++) {
                let data = buffer.getChannelData(c);
                for (let s = start; s < end; s++) {
                    let v = Math.abs(data[s]);
                    if (v > peak) {
                        peak = v;
                    }
                }
            }
            peaks.push(peak);
        }
        this.peaks = peaks;
    }

    /** Sizes the canvas to the wrapper and redraws peaks. */
    redrawWaveform() {
        if (!this.canvas || !this.waveformWrap) {
            return;
        }
        let dpr = window.devicePixelRatio || 1;
        let w = this.waveformWrap.clientWidth;
        let h = 72;
        if (w < 40) {
            w = 400;
        }
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        let ctx = this.canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        let mid = h / 2;
        let emphasis = getComputedStyle(document.documentElement).getPropertyValue('--emphasis').trim() || '#6cf';
        let mutedColor = 'rgba(255, 255, 255, 0.28)';
        let duration = this.audio.duration;
        let progress = (duration && !isNaN(duration) && duration > 0) ? this.audio.currentTime / duration : 0;
        let lineHalf = 0.5;
        if (this.waveformFailed || !this.peaks || this.peaks.length == 0) {
            ctx.fillStyle = mutedColor;
            ctx.fillRect(0, mid - lineHalf, w, lineHalf * 2);
            if (duration && !isNaN(duration) && duration > 0) {
                ctx.fillStyle = emphasis;
                ctx.fillRect(0, mid - lineHalf, w * progress, lineHalf * 2);
            }
            this.drawWaveformHoverLine(ctx, w, h);
            return;
        }
        let n = this.peaks.length;
        let maxPeak = 0.0001;
        for (let i = 0; i < n; i++) {
            if (this.peaks[i] > maxPeak) {
                maxPeak = this.peaks[i];
            }
        }
        ctx.fillStyle = mutedColor;
        ctx.fillRect(0, mid - lineHalf, w, lineHalf * 2);
        ctx.fillStyle = emphasis;
        ctx.fillRect(0, mid - lineHalf, w * progress, lineHalf * 2);
        let maxHalfAmp = h * 0.42;
        let silenceRel = 0.018;
        for (let i = 0; i < n; i++) {
            let norm = this.peaks[i] / maxPeak;
            if (norm < silenceRel) {
                continue;
            }
            let halfAmp = norm * maxHalfAmp;
            let x0 = Math.floor((i / n) * w);
            let x1 = Math.ceil(((i + 1) / n) * w);
            let barW = Math.max(1, x1 - x0);
            let barCenter = (i + 0.5) / n;
            let isPast = barCenter <= progress;
            ctx.fillStyle = isPast ? emphasis : mutedColor;
            ctx.fillRect(x0, mid - halfAmp, barW, halfAmp * 2);
        }
        this.drawWaveformHoverLine(ctx, w, h);
    }

    /** Draws a vertical line at the hover scrub position. */
    drawWaveformHoverLine(ctx, w, h) {
        if (this.hoverFraction == null || isNaN(this.hoverFraction)) {
            return;
        }
        let x = this.hoverFraction * w;
        if (x < 0 || x > w) {
            return;
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
    }

    /** Updates hover position from a viewport X coordinate. */
    setHoverFromClientX(clientX) {
        let rect = this.waveformWrap.getBoundingClientRect();
        if (rect.width <= 0) {
            return;
        }
        let percent = (clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        this.hoverFraction = percent;
        this.redrawWaveform();
    }

    /** Helper to format a time in seconds into a MM:SS string. */
    formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) {
            return '0:00';
        }
        let mins = Math.floor(seconds / 60);
        let secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /** Toggles play/pause. */
    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
        }
        else {
            this.audio.pause();
        }
        this.updateIcons();
    }

    /** While playing, drives smooth time + waveform updates via requestAnimationFrame. */
    startProgressAnimation() {
        if (this.progressRaf != null) {
            return;
        }
        let tick = () => {
            if (!this.canvas || !this.canvas.isConnected) {
                this.stopProgressAnimation();
                return;
            }
            if (this.audio.paused) {
                this.stopProgressAnimation();
                return;
            }
            this.refreshProgressDisplay();
            this.progressRaf = requestAnimationFrame(tick);
        };
        this.progressRaf = requestAnimationFrame(tick);
    }

    /** Stops the playback animation loop. */
    stopProgressAnimation() {
        if (this.progressRaf != null) {
            cancelAnimationFrame(this.progressRaf);
            this.progressRaf = null;
        }
    }

    /** Updates the current-time label and redraws the waveform (playhead). */
    refreshProgressDisplay() {
        this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
        this.redrawWaveform();
    }

    /** Clears scrub-drag state (pointer + global handler may both call). */
    finishScrubIfActive() {
        if (!this.isDragging) {
            return;
        }
        this.isDragging = false;
        this.pointerIdForScrub = null;
        if (uiImprover.videoControlDragging == this) {
            uiImprover.videoControlDragging = null;
        }
        this.refreshProgressDisplay();
    }

    /** Updates duration label. */
    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.audio.duration);
    }

    /** Seeks to the time under the given viewport X coordinate. */
    seekToClientX(clientX) {
        let rect = this.waveformWrap.getBoundingClientRect();
        if (rect.width <= 0) {
            return;
        }
        let percent = (clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        this.hoverFraction = percent;
        let d = this.audio.duration;
        if (d && !isNaN(d) && d > 0) {
            this.audio.currentTime = percent * d;
        }
    }

    /** Document-level mousemove while scrubbing (same hook as VideoControls). */
    drag(e) {
        if (!this.isDragging) {
            return;
        }
        this.seekToClientX(e.clientX);
        this.redrawWaveform();
    }

    /** Sets volume from the range input. */
    setVolume(e) {
        let volume = e.target.value / 100;
        e.target.dataset.lastRealVolume = `${e.target.value}`;
        this.audio.volume = volume;
        this.audio.muted = volume < 0.001;
        localStorage.setItem('audiovolume_last', `${e.target.value}`);
        localStorage.setItem('audiovolume_lastmuted', `${this.audio.muted}`);
        this.updateIcons();
    }

    /** Toggles mute. */
    toggleMute() {
        this.audio.muted = !this.audio.muted;
        if (this.audio.muted) {
            this.volumeSlider.value = 0;
        }
        else if (this.volumeSlider.dataset.lastRealVolume) {
            this.audio.volume = parseFloat(this.volumeSlider.dataset.lastRealVolume) / 100;
            if (this.audio.volume < 0.01) {
                this.audio.volume = 0.5;
            }
        }
        localStorage.setItem('audiovolume_lastmuted', `${this.audio.muted}`);
        this.updateIcons();
    }

    /** Updates play and volume button icons and range fill. */
    updateIcons() {
        let volume = this.audio.muted ? 0 : this.audio.volume;
        this.volumeSlider.value = volume * 100;
        updateRangeStyle(this.volumeSlider);
        if (volume == 0) {
            this.volumeBtn.textContent = '🔇';
        }
        else if (volume < 0.5) {
            this.volumeBtn.textContent = '🔉';
        }
        else {
            this.volumeBtn.textContent = '🔊';
        }
        if (this.audio.paused) {
            this.playBtn.textContent = '▶';
        }
        else {
            this.playBtn.textContent = '⏸';
        }
    }
}

///////////// Older-style popover code, to be cleaned

function doPopHideCleanup(target) {
    for (let x = 0; x < popHide.length; x++) {
        let id = popHide[x];
        let pop = id.popover ? id.popover : getRequiredElementById(`popover_${id}`);
        if (id == lastPopover && Date.now() - lastPopoverTime < 50) {
            continue;
        }
        if (pop.contains(target) && !target.classList.contains('sui_popover_model_button')) {
            continue;
        }
        if (id instanceof AdvancedPopover) {
            if (Date.now() - id.created > 50) {
                id.remove();
            }
        }
        else {
            pop.classList.remove('sui-popover-visible');
            pop.dataset.visible = "false";
            popHide.splice(x, 1);
        }
    }
}

document.addEventListener('mousedown', (e) => {
    mouseX = e.pageX;
    mouseY = e.pageY;
    if (e.button == 2) { // right-click
        doPopHideCleanup(e.target);
    }
}, true);

document.addEventListener('click', (e) => {
    if (e.target.tagName == 'BODY') {
        return; // it's impossible on the genpage to actually click body, so this indicates a bugged click, so ignore it
    }
    doPopHideCleanup(e.target);
}, true);

/** Ensures the popover for the given ID is hidden. */
function hidePopover(id) {
    let pop = getRequiredElementById(`popover_${id}`);
    if (pop.dataset.visible == "true") {
        pop.classList.remove('sui-popover-visible');
        pop.dataset.visible = "false";
        popHide.splice(popHide.indexOf(id), 1);
    }
}

/** Shows the given popover, optionally at the specified location. */
function showPopover(id, targetX = mouseX, targetY = mouseY) {
    let pop = getRequiredElementById(`popover_${id}`);
    if (pop.dataset.visible == "true") {
        hidePopover(id); // Hide to reset before showing again.
    }
    pop.classList.add('sui-popover-visible');
    pop.style.width = '200px';
    pop.dataset.visible = "true";
    let x = Math.min(targetX, window.innerWidth - pop.offsetWidth - 10);
    let y = Math.min(targetY, window.innerHeight - pop.offsetHeight);
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    pop.style.width = '';
    popHide.push(id);
    lastPopoverTime = Date.now();
    lastPopover = id;
}

/** Toggles the given popover, showing it or hiding it as relevant. */
function doPopover(id, e) {
    let pop = getRequiredElementById(`popover_${id}`);
    if (pop.dataset.visible == "true") {
        hidePopover(id);
    }
    else if (e && e.target) {
        let rect = e.target.getBoundingClientRect();
        showPopover(id, rect.left, rect.bottom + 15);
    }
    else {
        showPopover(id);
    }
    if (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}

/** Shows a notice popover with the given text and color. */
function doNoticePopover(text, className, targetX = mouseX, targetY = mouseY) {
    let pop = createDiv(null, `sui-popover sui_popover_model ${className} sui-popover-notice`);
    pop.style.width = '200px';
    let x = Math.min(targetX, window.innerWidth - pop.offsetWidth - 10);
    let y = Math.min(targetY, window.innerHeight - pop.offsetHeight);
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    pop.style.width = '';
    pop.innerText = translate(text);
    document.body.appendChild(pop);
    setTimeout(() => {
        pop.classList.add('sui-popover-notice-fade-1s');
        setTimeout(() => {
            pop.remove();
        }, 1500);
    }, 1000);
}
