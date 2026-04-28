
/** Shared play, volume, mute, time formatting, Swarm volume persistence, and smooth playback progress for custom HTML media control bars. */
class MediaControlsBase {

    constructor(mediaElement) {
        this.media = mediaElement;
        this.isDragging = false;
        this.progressRaf = null;
    }

    /** Formats seconds as M:SS. */
    formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) {
            return '0:00';
        }
        let mins = Math.floor(seconds / 60);
        let secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /** Wires play/volume buttons and applies user volume settings (requires element refs already set). */
    wirePlayAndVolumeHandlers() {
        this.volumeSlider.dataset.lastRealVolume = "100";
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e));
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        this.applyInitialVolumeFromUserSettings();
        this.updateIcons();
    }

    /** Applies `audio.videoaudiobehavior` and last-known volume from localStorage. */
    applyInitialVolumeFromUserSettings() {
        let userSetting = typeof getUserSetting == 'function' ? getUserSetting('audio.videoaudiobehavior', 'last') : 'play';
        if (userSetting == 'play') {
            this.media.muted = false;
        }
        else if (userSetting == 'silent') {
            this.volumeSlider.value = 0;
            this.volumeSlider.dataset.lastRealVolume = "0";
            this.media.volume = 0;
            this.media.muted = true;
        }
        else {
            let lastVolume = localStorage.getItem('audiovolume_last') || "100";
            let lastMuted = localStorage.getItem('audiovolume_lastmuted') == "true";
            this.volumeSlider.value = lastMuted ? 0 : parseFloat(lastVolume);
            this.volumeSlider.dataset.lastRealVolume = lastVolume;
            this.media.volume = parseFloat(lastVolume) / 100;
            this.media.muted = lastMuted;
        }
    }

    /** Toggles play/pause. */
    togglePlay() {
        if (this.media.paused) {
            this.media.play();
        }
        else {
            this.media.pause();
        }
        this.updateIcons();
    }

    /** Volume slider input handler. */
    setVolume(e) {
        let volume = e.target.value / 100;
        e.target.dataset.lastRealVolume = `${e.target.value}`;
        this.media.volume = volume;
        this.media.muted = volume < 0.001;
        localStorage.setItem('audiovolume_last', `${e.target.value}`);
        localStorage.setItem('audiovolume_lastmuted', `${this.media.muted}`);
        this.updateIcons();
    }

    /** Mute toggle button handler. */
    toggleMute() {
        this.media.muted = !this.media.muted;
        if (this.media.muted) {
            this.volumeSlider.value = 0;
        }
        else if (this.volumeSlider.dataset.lastRealVolume) {
            this.media.volume = parseFloat(this.volumeSlider.dataset.lastRealVolume) / 100;
            if (this.media.volume < 0.01) {
                this.media.volume = 0.5;
            }
        }
        localStorage.setItem('audiovolume_lastmuted', `${this.media.muted}`);
        this.updateIcons();
    }

    /** Refreshes play/volume glyphs and range fill. */
    updateIcons() {
        let volume = this.media.muted ? 0 : this.media.volume;
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
        if (this.media.paused) {
            this.playBtn.textContent = '▶';
        }
        else {
            this.playBtn.textContent = '⏸';
        }
    }

    /** Clamped horizontal fraction [0, 1] for scrubbing, or null if the element has no width. */
    static scrubFractionFromClientX(clientX, element) {
        let rect = element.getBoundingClientRect();
        if (rect.width <= 0) {
            return null;
        }
        let percent = (clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(1, percent));
    }

    /** While playing, drives smooth progress updates via requestAnimationFrame. */
    startProgressAnimation() {
        if (this.progressRaf != null) {
            return;
        }
        let tick = () => {
            if (!this.isProgressAnimationHostConnected()) {
                this.stopProgressAnimation();
                return;
            }
            if (this.media.paused) {
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

    /** Whether the DOM subtree used for progress animation is still connected (override if needed). */
    isProgressAnimationHostConnected() {
        return this.media.isConnected;
    }

    /** Wires play/pause/ended/seeked listeners for smooth RAF-based progress during playback. */
    wirePlaybackProgressRafListeners() {
        this.media.addEventListener('seeked', () => this.refreshProgressDisplay());
        this.media.addEventListener('play', () => {
            this.updateIcons();
            this.startProgressAnimation();
        });
        this.media.addEventListener('pause', () => {
            this.updateIcons();
            this.stopProgressAnimation();
            this.refreshProgressDisplay();
        });
        this.media.addEventListener('ended', () => {
            this.updateIcons();
            this.stopProgressAnimation();
            this.refreshProgressDisplay();
        });
    }
}

/** Helper class to inject custom JS video controls to a 'video' element. */
class VideoControls extends MediaControlsBase {

    constructor(videoElement) {
        super(videoElement);
        this.createControls();
    }

    /** Creates the controls UI for the video. */
    createControls() {
        let container = this.media.parentElement;
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
        this.wirePlayAndVolumeHandlers();
        this.media.addEventListener('loadedmetadata', () => this.updateDuration());
        this.wirePlaybackProgressRafListeners();
        container.addEventListener('mouseenter', () => { controls.style.opacity = 1; });
        container.addEventListener('mouseleave', () => { controls.style.opacity = 0; });
        this.progressBar.addEventListener('click', (e) => this.seek(e));
        this.progressBar.addEventListener('mousedown', () => { this.isDragging = true; uiImprover.videoControlDragging = this; });
        this.media.draggable = true;
        this.media.addEventListener('dragstart', (e) => {
            let src = this.media.currentSrc || this.media.src;
            if (src) {
                chromeIsDumbFileHack(e.dataTransfer.files[0], src);
                e.dataTransfer.clearData();
                e.dataTransfer.setData('text/uri-list', src);
            }
        });
        if (!this.media.paused) {
            this.startProgressAnimation();
        }
    }

    /** Whether the progress bar element is still in the document (used by RAF loop in MediaControlsBase). */
    isProgressAnimationHostConnected() {
        return !!(this.progressBar && this.progressBar.isConnected);
    }

    /** Updates the progress bar and current-time label to match the video. */
    refreshProgressDisplay() {
        let d = this.media.duration;
        let percent = (d && !isNaN(d) && d > 0) ? (this.media.currentTime / d) * 100 : 0;
        this.progressFilled.style.width = `${percent}%`;
        this.currentTimeEl.textContent = this.formatTime(this.media.currentTime);
    }

    /** Updates the duration UI text to match the video. */
    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.media.duration);
    }

    /** Seeks from a click on the progress bar. */
    seek(e) {
        let p = MediaControlsBase.scrubFractionFromClientX(e.clientX, this.progressBar);
        let d = this.media.duration;
        if (p == null || !d || isNaN(d) || d <= 0) {
            return;
        }
        this.media.currentTime = p * d;
    }

    /** Document-level mousemove while dragging the progress bar. */
    drag(e) {
        if (!this.isDragging) {
            return;
        }
        let p = MediaControlsBase.scrubFractionFromClientX(e.clientX, this.progressBar);
        let d = this.media.duration;
        if (p == null || !d || isNaN(d) || d <= 0) {
            return;
        }
        this.media.currentTime = p * d;
        this.refreshProgressDisplay();
    }
}

/** Helper class to inject custom JS audio controls (with waveform) on an 'audio' element. */
class AudioControls extends MediaControlsBase {

    constructor(audioElement) {
        super(audioElement);
        this.peaks = null;
        this.waveformFailed = false;
        this.resizeObserver = null;
        this.hoverFraction = null;
        this.pointerIdForScrub = null;
        this.createControls();
        this.loadWaveform();
    }

    /** Creates the controls UI and waveform canvas. */
    createControls() {
        let container = this.media.parentElement;
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
        this.wirePlayAndVolumeHandlers();
        this.media.addEventListener('loadedmetadata', () => this.updateDuration());
        this.wirePlaybackProgressRafListeners();
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
        if (typeof ResizeObserver != 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.redrawWaveform());
            this.resizeObserver.observe(this.waveformWrap);
        }
        if (!this.media.paused) {
            this.startProgressAnimation();
        }
    }

    /** Fetches and decodes audio to build peak data for the waveform. */
    loadWaveform() {
        let src = this.media.currentSrc || this.media.src;
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
                if (!this.media.isConnected) {
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
        let duration = this.media.duration;
        let progress = (duration && !isNaN(duration) && duration > 0) ? this.media.currentTime / duration : 0;
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
        let p = MediaControlsBase.scrubFractionFromClientX(clientX, this.waveformWrap);
        if (p == null) {
            return;
        }
        this.hoverFraction = p;
        this.redrawWaveform();
    }

    /** Whether the waveform canvas is still in the document (used by RAF loop in MediaControlsBase). */
    isProgressAnimationHostConnected() {
        return !!(this.canvas && this.canvas.isConnected);
    }

    /** Updates the current-time label and redraws the waveform (playhead). */
    refreshProgressDisplay() {
        this.currentTimeEl.textContent = this.formatTime(this.media.currentTime);
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
        this.durationEl.textContent = this.formatTime(this.media.duration);
    }

    /** Seeks to the time under the given viewport X coordinate. */
    seekToClientX(clientX) {
        let p = MediaControlsBase.scrubFractionFromClientX(clientX, this.waveformWrap);
        if (p == null) {
            return;
        }
        this.hoverFraction = p;
        let d = this.media.duration;
        if (d && !isNaN(d) && d > 0) {
            this.media.currentTime = p * d;
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
}
