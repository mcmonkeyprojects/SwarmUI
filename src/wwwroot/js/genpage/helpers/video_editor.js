/** Advanced editing tool for videos, such as trimming and cropping. */
class VideoEditorInterface {

    constructor() {
        this.modal = getRequiredElementById('video_editor_modal');
        this.modalJq = $(this.modal);
        this.video = getRequiredElementById('video_editor_video');
        this.videoControls = new VideoControls(this.video);
        this.resolutionText = getRequiredElementById('video_editor_resolution');
        this.scaleBox = getRequiredElementById('video_editor_scale_box');
        this.scaleBox.innerHTML = makeSliderInput(null, 'video_editor_scale', 'scale', 'Scale', '', 1, 0, 16, 0, 2, 0.025, false, false, false, 0.01);
        enableSlidersIn(this.scaleBox);
        this.scaleInput = getRequiredElementById('video_editor_scale');
        this.scaleInput.addEventListener('input', () => this.onScaleChanged());
        this.scaleInput.addEventListener('change', () => this.onScaleChanged());
        this.cropOverlay = getRequiredElementById('video_editor_crop_overlay');
        this.cropSelection = getRequiredElementById('video_editor_crop_selection');
        this.timeline = getRequiredElementById('video_editor_timeline');
        this.timelineSelection = getRequiredElementById('video_editor_timeline_selection');
        this.timelineExcludedLeft = getRequiredElementById('video_editor_timeline_excluded_left');
        this.timelineExcludedRight = getRequiredElementById('video_editor_timeline_excluded_right');
        this.timelineCursor = getRequiredElementById('video_editor_timeline_cursor');
        this.trimHandleLeft = this.timeline.querySelector('[data-trim-handle="left"]');
        this.trimHandleRight = this.timeline.querySelector('[data-trim-handle="right"]');
        this.trimStartText = getRequiredElementById('video_editor_trim_start');
        this.currentTimeText = getRequiredElementById('video_editor_current_time');
        this.trimEndText = getRequiredElementById('video_editor_trim_end');
        this.durationText = getRequiredElementById('video_editor_duration');
        this.resetCropButton = getRequiredElementById('video_editor_reset_crop');
        this.saveAudioButton = getRequiredElementById('video_editor_save_audio');
        this.saveVideoButton = getRequiredElementById('video_editor_save_video');
        this.sourceVideo = null;
        this.videoData = null;
        this.filename = '';
        this.duration = 0;
        this.trimStart = 0;
        this.trimEnd = 0;
        this.timelinePointer = null;
        this.cropPointer = null;
        this.resetCrop();
        this.video.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
        this.video.addEventListener('timeupdate', () => this.updateTimeline());
        this.video.addEventListener('seeked', () => this.updateTimeline());
        this.timeline.addEventListener('pointerdown', e => this.startTimelinePointer(e));
        this.timeline.addEventListener('pointermove', e => this.moveTimelinePointer(e));
        this.timeline.addEventListener('pointerup', e => this.endTimelinePointer(e));
        this.timeline.addEventListener('pointercancel', e => this.endTimelinePointer(e));
        for (let handle of this.cropSelection.querySelectorAll('[data-crop-handle]')) {
            handle.addEventListener('pointerdown', e => this.startCropPointer(e));
            handle.addEventListener('pointermove', e => this.moveCropPointer(e));
            handle.addEventListener('pointerup', e => this.endCropPointer(e));
            handle.addEventListener('pointercancel', e => this.endCropPointer(e));
        }
        this.resetCropButton.addEventListener('click', () => this.resetCrop());
        this.saveAudioButton.addEventListener('click', () => this.saveAudio());
        this.saveVideoButton.addEventListener('click', () => this.saveVideo());
        getRequiredElementById('video_editor_close').addEventListener('click', () => this.modalJq.modal('hide'));
        this.modalJq.on('hidden.bs.modal', () => this.cleanup());
    }

    /** Opens the editor for a video. */
    open(video) {
        currentImageHelper.doAutoPause();
        this.sourceVideo = video;
        this.videoData = video.dataset.filedata || getImageFullSrc(video.dataset.src || video.currentSrc || video.src);
        this.filename = video.dataset.filename || (isValidMediaPath(this.videoData) ? this.videoData : '');
        this.duration = 0;
        this.trimStart = 0;
        this.trimEnd = 0;
        this.resetCrop();
        this.resetScale();
        this.setSaving(false);
        this.saveAudioButton.style.display = this.hasAudio(video) ? '' : 'none';
        this.video.src = video.currentSrc || video.src || video.dataset.src;
        this.video.load();
        this.modalJq.modal('show');
        this.saveVideoButton.disabled = true;
    }

    /** Releases the active video when the modal closes. */
    cleanup() {
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        this.sourceVideo = null;
        this.videoData = null;
        this.filename = '';
        this.timelinePointer = null;
        this.cropPointer = null;
    }

    /** Detects an audio track using the browser's available media API. */
    hasAudio(video) {
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
            return true;
        }
        if (video.audioTracks) {
            return video.audioTracks.length > 0;
        }
        if (typeof video.mozHasAudio == 'boolean') {
            return video.mozHasAudio;
        }
        if (typeof video.captureStream == 'function' && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            return video.captureStream().getAudioTracks().length > 0;
        }
        if (typeof video.webkitAudioDecodedByteCount == 'number') {
            return video.webkitAudioDecodedByteCount > 0;
        }
        return true;
    }

    /** Initializes the timeline from loaded video metadata. */
    onMetadataLoaded() {
        this.duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
        this.trimStart = 0;
        this.trimEnd = this.duration;
        this.saveAudioButton.style.display = this.sourceVideo && this.hasAudio(this.sourceVideo) ? '' : 'none';
        this.updateTimeline();
        this.updateResolution();
    }

    /** Formats seconds for timeline labels. */
    formatTime(seconds) {
        let hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        let minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        let result = '';
        if (hours > 0) {
            result += `${hours.toFixed(0).padStart(2, '0')}:`;
        }
        result += `${minutes.toFixed(0).padStart(2, '0')}:`;
        result += `${seconds.toFixed(2).padStart(5, '0')}`;
        return result;
    }

    /** Updates the timeline display. */
    updateTimeline() {
        let start = this.duration > 0 ? this.trimStart / this.duration * 100 : 0;
        let end = this.duration > 0 ? this.trimEnd / this.duration * 100 : 100;
        let current = this.duration > 0 ? this.video.currentTime / this.duration * 100 : 0;
        this.timelineSelection.style.left = `${start}%`;
        this.timelineSelection.style.width = `${Math.max(0, end - start)}%`;
        this.timelineExcludedLeft.style.left = '0';
        this.timelineExcludedLeft.style.width = `${start}%`;
        this.timelineExcludedRight.style.left = `${end}%`;
        this.timelineExcludedRight.style.width = `${Math.max(0, 100 - end)}%`;
        this.timelineCursor.style.left = `${Math.max(0, Math.min(100, current))}%`;
        this.trimHandleLeft.style.left = `${start}%`;
        this.trimHandleRight.style.left = `${end}%`;
        this.trimStartText.textContent = `Start: ${this.formatTime(this.trimStart)}`;
        this.currentTimeText.textContent = `Position: ${this.formatTime(this.video.currentTime)}`;
        this.trimEndText.textContent = `End: ${this.formatTime(this.trimEnd)}`;
        this.durationText.textContent = `Duration: ${this.formatTime(this.trimEnd - this.trimStart)}`;
    }

    /** Starts timeline seeking or trim dragging. */
    startTimelinePointer(e) {
        if (this.duration <= 0) {
            return;
        }
        e.preventDefault();
        this.timelinePointer = { id: e.pointerId, side: e.target.dataset.trimHandle || null };
        try {
            this.timeline.setPointerCapture(e.pointerId);
        }
        catch (err) {
        }
        this.applyTimelinePointer(e.clientX);
    }

    /** Continues a timeline pointer action. */
    moveTimelinePointer(e) {
        if (this.timelinePointer?.id == e.pointerId) {
            this.applyTimelinePointer(e.clientX);
        }
    }

    /** Ends a timeline pointer action. */
    endTimelinePointer(e) {
        if (this.timelinePointer?.id != e.pointerId) {
            return;
        }
        this.applyTimelinePointer(e.clientX);
        this.timelinePointer = null;
    }

    /** Applies seeking or trimming at a timeline position. */
    applyTimelinePointer(clientX) {
        let fraction = MediaControlsBase.scrubFractionFromClientX(clientX, this.timeline);
        if (fraction == null) {
            return;
        }
        let time = fraction * this.duration;
        if (this.timelinePointer.side == 'left') {
            this.trimStart = Math.min(time, this.trimEnd - Math.min(0.01, this.duration));
            this.video.currentTime = this.trimStart;
        }
        else if (this.timelinePointer.side == 'right') {
            this.trimEnd = Math.max(time, this.trimStart + Math.min(0.01, this.duration));
            this.video.currentTime = this.trimEnd;
        }
        else {
            this.video.currentTime = time;
        }
        this.updateTimeline();
        this.saveVideoButton.disabled = false;
    }

    /** Resets cropping to the complete frame. */
    resetCrop() {
        this.cropBounds = { left: 0, top: 0, right: 1, bottom: 1 };
        this.updateCrop();
    }

    /** Updates the crop overlay. */
    updateCrop() {
        this.cropSelection.style.left = `${this.cropBounds.left * 100}%`;
        this.cropSelection.style.top = `${this.cropBounds.top * 100}%`;
        this.cropSelection.style.width = `${(this.cropBounds.right - this.cropBounds.left) * 100}%`;
        this.cropSelection.style.height = `${(this.cropBounds.bottom - this.cropBounds.top) * 100}%`;
        this.saveVideoButton.disabled = false;
        this.updateResolution();
    }

    /** Shows the cropped and scaled output resolution and aspect ratio. */
    updateResolution() {
        let origWidth = this.video.videoWidth;
        let origHeight = this.video.videoHeight;
        let width = origWidth;
        let height = origHeight;
        if (width <= 0 || height <= 0) {
            this.resolutionText.textContent = '';
            return;
        }
        let crop = this.getCropRequest();
        if (crop.cropWidth && crop.cropHeight) {
            width = crop.cropWidth;
            height = crop.cropHeight;
        }
        let scale = this.getScale();
        if (scale != 1) {
            width = Math.max(8, roundTo(width * scale, 8));
            height = Math.max(8, roundTo(height * scale, 8));
        }
        this.resolutionText.textContent = `${origWidth}x${origHeight} (${describeAspectRatio(origWidth, origHeight)}) → ${width}x${height} (${describeAspectRatio(width, height)})`;
    }

    /** Returns the current output scale factor. */
    getScale() {
        let scale = parseFloat(this.scaleInput.value);
        if (!Number.isFinite(scale)) {
            return 1;
        }
        return Math.max(0, Math.min(8, scale));
    }

    /** Resets scale to 1 (no resize). */
    resetScale() {
        this.scaleInput.value = 1;
        this.scaleInput.dispatchEvent(new Event('input'));
        this.updateResolution();
    }

    /** Updates resolution when the scale slider changes. */
    onScaleChanged() {
        this.updateResolution();
        this.saveVideoButton.disabled = false;
    }

    /** Starts dragging a crop corner. */
    startCropPointer(e) {
        e.preventDefault();
        e.stopPropagation();
        this.cropPointer = { id: e.pointerId, corner: e.currentTarget.dataset.cropHandle };
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        catch (err) {
        }
    }

    /** Continues dragging a crop corner. */
    moveCropPointer(e) {
        if (this.cropPointer?.id != e.pointerId) {
            return;
        }
        let rect = this.cropOverlay.getBoundingClientRect();
        let x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        let y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        let minX = this.video.videoWidth > 0 ? 2 / this.video.videoWidth : 0.001;
        let minY = this.video.videoHeight > 0 ? 2 / this.video.videoHeight : 0.001;
        if (this.cropPointer.corner.includes('w')) {
            this.cropBounds.left = Math.min(x, this.cropBounds.right - minX);
        }
        else {
            this.cropBounds.right = Math.max(x, this.cropBounds.left + minX);
        }
        if (this.cropPointer.corner.includes('n')) {
            this.cropBounds.top = Math.min(y, this.cropBounds.bottom - minY);
        }
        else {
            this.cropBounds.bottom = Math.max(y, this.cropBounds.top + minY);
        }
        this.updateCrop();
    }

    /** Ends a crop pointer action. */
    endCropPointer(e) {
        if (this.cropPointer?.id == e.pointerId) {
            this.moveCropPointer(e);
            this.cropPointer = null;
        }
    }

    /** Returns trimming parameters for media APIs. */
    getTrimRequest() {
        return { startMilliseconds: Math.round(this.trimStart * 1000), endMilliseconds: Math.abs(this.trimEnd - this.duration) < 0.001 ? -1 : Math.round(this.trimEnd * 1000) };
    }

    /** Returns even-pixel crop parameters for video encoding. */
    getCropRequest() {
        if (this.cropBounds.left == 0 && this.cropBounds.top == 0 && this.cropBounds.right == 1 && this.cropBounds.bottom == 1) {
            return { cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 0 };
        }
        let cropX = Math.floor(this.cropBounds.left * this.video.videoWidth / 2) * 2;
        let cropY = Math.floor(this.cropBounds.top * this.video.videoHeight / 2) * 2;
        let cropWidth = Math.max(2, Math.floor((Math.ceil(this.cropBounds.right * this.video.videoWidth) - cropX) / 2) * 2);
        let cropHeight = Math.max(2, Math.floor((Math.ceil(this.cropBounds.bottom * this.video.videoHeight) - cropY) / 2) * 2);
        return { cropX, cropY, cropWidth, cropHeight };
    }

    /** Toggles save buttons while an operation is running. */
    setSaving(saving) {
        this.saveAudioButton.disabled = saving;
        this.saveVideoButton.disabled = saving;
    }

    /** Adds a saved edit to the Batch View. */
    addOutputToBatch(result) {
        mainGenHandler.gotImageResult(`${getImageOutPrefix()}/${result.result}`, '{}', '0');
        if (inputBrowserHelper.inputImageBrowser) {
            inputBrowserHelper.inputImageBrowser.lightRefresh();
        }
    }

    /** Saves the trimmed audio as a Batch View output. */
    saveAudio() {
        if (!this.videoData || this.duration <= 0) {
            return;
        }
        this.setSaving(true);
        let trim = this.getTrimRequest();
        genericRequest('ExtractVideoAudio', { video: this.videoData, filename: this.filename, ...trim }, result => {
            this.addOutputToBatch(result);
            this.setSaving(false);
            this.saveAudioButton.style.display = 'none';
        }, 0, error => {
            this.setSaving(false);
            showError(error);
        });
    }

    /** Saves the edited video as a Batch View output. */
    saveVideo() {
        if (!this.videoData || this.duration <= 0) {
            return;
        }
        this.setSaving(true);
        let request = { video: this.videoData, filename: this.filename, ...this.getTrimRequest(), ...this.getCropRequest(), scale: this.getScale() };
        genericRequest('EditVideo', request, result => {
            this.addOutputToBatch(result);
            this.setSaving(false);
            this.saveVideoButton.disabled = true;
        }, 0, error => {
            this.setSaving(false);
            showError(error);
        });
    }
}

let videoEditorInterface = new VideoEditorInterface();
