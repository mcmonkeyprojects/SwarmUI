/** A section of the media timeline. */
class MediaEditorSection {

    constructor(startFrame, endFrame, excluded = false, volume = 1) {
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.excluded = excluded;
        this.volume = volume;
    }

    /** Returns an independent copy of this section with new bounds. */
    clone(startFrame, endFrame) {
        return new MediaEditorSection(startFrame, endFrame, this.excluded, this.volume);
    }

    /** Returns the section data sent to the media editing API. */
    toRequest(frameRate) {
        return { startMilliseconds: Math.round(this.startFrame / frameRate * 1000), endMilliseconds: Math.round(this.endFrame / frameRate * 1000), excluded: this.excluded, volume: this.volume };
    }
}

/** Advanced timeline based editing tool for media, such as trimming and cropping. */
class MediaEditorInterface {

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
        this.stage = this.modal.querySelector('.video_editor_stage');
        this.cropOverlay = getRequiredElementById('video_editor_crop_overlay');
        this.cropSelection = getRequiredElementById('video_editor_crop_selection');
        this.timeline = getRequiredElementById('video_editor_timeline');
        this.timelineSelection = getRequiredElementById('video_editor_timeline_selection');
        this.timelineExcludedLeft = getRequiredElementById('video_editor_timeline_excluded_left');
        this.timelineExcludedRight = getRequiredElementById('video_editor_timeline_excluded_right');
        this.sectionsContainer = getRequiredElementById('video_editor_sections');
        this.splitMarksContainer = getRequiredElementById('video_editor_split_marks');
        this.timelineCursor = getRequiredElementById('video_editor_timeline_cursor');
        this.waveform = getRequiredElementById('video_editor_waveform');
        this.trimHandleLeft = this.timeline.querySelector('[data-trim-handle="left"]');
        this.trimHandleRight = this.timeline.querySelector('[data-trim-handle="right"]');
        this.trimStartText = getRequiredElementById('video_editor_trim_start');
        this.currentTimeText = getRequiredElementById('video_editor_current_time');
        this.trimEndText = getRequiredElementById('video_editor_trim_end');
        this.durationText = getRequiredElementById('video_editor_duration');
        this.resetCropButton = getRequiredElementById('video_editor_reset_crop');
        this.splitMarkButton = getRequiredElementById('video_editor_split_mark');
        this.sectionControls = getRequiredElementById('video_editor_section_controls');
        this.excludeSectionButton = getRequiredElementById('video_editor_exclude_section');
        this.sectionVolumeSlider = getRequiredElementById('video_editor_section_volume');
        this.sectionVolumeValue = getRequiredElementById('video_editor_section_volume_value');
        this.saveAudioButton = getRequiredElementById('video_editor_save_audio');
        this.saveVideoButton = getRequiredElementById('video_editor_save_video');
        this.videoData = null;
        this.isAudio = false;
        this.filename = '';
        this.duration = 0;
        this.trimStart = 0;
        this.trimEnd = 0;
        this.frameRate = 24;
        this.currentFrameIndex = 0;
        this.splitFrames = [];
        this.sections = [];
        this.timelinePointer = null;
        this.cropPointer = null;
        this.waveformPeaks = null;
        this.resetCrop();
        this.video.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
        this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.video.addEventListener('seeked', () => this.updateTimeline());
        this.timeline.addEventListener('pointerdown', e => this.startTimelinePointer(e));
        this.timeline.addEventListener('pointermove', e => this.moveTimelinePointer(e));
        this.timeline.addEventListener('pointerup', e => this.endTimelinePointer(e));
        this.timeline.addEventListener('pointercancel', e => this.endTimelinePointer(e));
        this.timelineResizeObserver = new ResizeObserver(() => this.redrawAudioWaveform());
        this.timelineResizeObserver.observe(this.timeline);
        for (let handle of this.cropSelection.querySelectorAll('[data-crop-handle]')) {
            handle.addEventListener('pointerdown', e => this.startCropPointer(e));
            handle.addEventListener('pointermove', e => this.moveCropPointer(e));
            handle.addEventListener('pointerup', e => this.endCropPointer(e));
            handle.addEventListener('pointercancel', e => this.endCropPointer(e));
        }
        this.resetCropButton.addEventListener('click', () => this.resetCrop());
        this.splitMarkButton.addEventListener('click', () => this.toggleSplitMark());
        this.excludeSectionButton.addEventListener('click', () => this.toggleExcludeSection());
        this.sectionVolumeSlider.addEventListener('input', () => this.onSectionVolumeChanged());
        this.saveAudioButton.addEventListener('click', () => this.saveAudio());
        this.saveVideoButton.addEventListener('click', () => this.saveMedia());
        document.addEventListener('keydown', e => this.onKeyDown(e));
        getRequiredElementById('video_editor_close').addEventListener('click', () => this.modalJq.modal('hide'));
        this.modalJq.on('hidden.bs.modal', () => this.cleanup());
    }

    /** Opens the editor for a video/audio element or source URL. */
    open(media, metadata = null, mediaPath = null) {
        currentImageHelper.doAutoPause();
        let isSourceUrl = typeof media == 'string';
        let playbackSource = isSourceUrl ? media : (media.currentSrc || media.src || media.dataset.src);
        this.videoData = isSourceUrl ? (mediaPath || getImageFullSrc(media)) : (media.dataset.filedata || getImageFullSrc(media.dataset.src || media.currentSrc || media.src));
        this.isAudio = isSourceUrl ? getMediaType(media) == 'audio' : media.tagName == 'AUDIO';
        this.frameRate = this.getMediaFrameRate(media, metadata);
        this.currentFrameIndex = 0;
        this.videoControls.setVolumeMultiplier(1);
        this.modal.classList.toggle('video_editor_audio', this.isAudio);
        this.filename = isSourceUrl ? (media.startsWith('data:') ? '' : this.videoData) : (media.dataset.filename || (isValidMediaPath(this.videoData) ? this.videoData : ''));
        this.duration = 0;
        this.trimStart = 0;
        this.trimEnd = 0;
        this.splitFrames = [];
        this.sections = [];
        this.renderSplitMarks();
        this.renderSections();
        this.splitMarkButton.disabled = true;
        this.sectionControls.style.display = 'none';
        this.updateSplitMarkButton();
        this.resetCrop();
        this.resetScale();
        this.setSaving(false);
        this.resolutionText.style.display = this.isAudio ? 'none' : '';
        this.scaleBox.style.display = this.isAudio ? 'none' : '';
        this.cropOverlay.style.display = this.isAudio ? 'none' : '';
        this.resetCropButton.style.display = this.isAudio ? 'none' : '';
        this.saveAudioButton.style.display = 'none';
        this.saveVideoButton.textContent = translate(this.isAudio ? 'Save Audio' : 'Save Video');
        this.waveformPeaks = null;
        this.waveform.style.display = '';
        this.waveform.width = 0;
        this.video.src = playbackSource;
        this.video.load();
        this.modalJq.modal('show');
        this.saveVideoButton.disabled = true;
    }

    /** Releases the active video when the modal closes. */
    cleanup() {
        this.video.pause();
        this.videoControls.setVolumeMultiplier(1);
        this.video.removeAttribute('src');
        this.video.load();
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

    /** Initializes the timeline from loaded media metadata. */
    onMetadataLoaded() {
        this.duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
        this.trimStart = 0;
        this.trimEnd = this.duration;
        this.sections = this.duration > 0 ? [new MediaEditorSection(0, this.getFrameIndex(this.duration))] : [];
        this.syncSplitFrames();
        this.splitMarkButton.disabled = this.duration <= 0;
        this.saveAudioButton.style.display = !this.isAudio && this.hasAudio(this.video) ? '' : 'none';
        this.updateTimeline();
        this.renderSections();
        this.renderSplitMarks();
        this.updateResolution();
        this.renderAudioWaveform();
    }

    /** Returns the media frame rate from generation metadata, defaulting to 24 FPS. */
    getMediaFrameRate(media, metadata = null) {
        if ((typeof media == 'string' && getMediaType(media) == 'audio') || media.tagName == 'AUDIO') {
            return 24;
        }
        try {
            let parsedMetadata = JSON.parse(metadata || media.dataset?.metadata || '{}');
            let frameRate = parseFloat(parsedMetadata.sui_image_params?.videofps);
            if (Number.isFinite(frameRate) && frameRate > 0) {
                return frameRate;
            }
        }
        catch (err) {
        }
        return 24;
    }

    /** Returns the zero-based frame index at a media time. */
    getFrameIndex(time) {
        return Math.max(0, Math.round(time * this.frameRate));
    }

    /** Renders the media's audio waveform behind the timeline controls. */
    async renderAudioWaveform() {
        let source = this.video.currentSrc || this.video.src;
        try {
            let peaks = await getAudioWaveformPeaks(source);
            if (source != (this.video.currentSrc || this.video.src)) {
                return;
            }
            this.waveformPeaks = peaks;
            this.redrawAudioWaveform();
        }
        catch (err) {
            if (source == (this.video.currentSrc || this.video.src)) {
                this.waveform.style.display = 'none';
            }
        }
    }

    /** Redraws the audio waveform at the current timeline size. */
    redrawAudioWaveform() {
        let width = this.timeline.clientWidth;
        let height = this.timeline.clientHeight;
        if (!this.waveformPeaks || width <= 0 || height <= 0) {
            return;
        }
        renderWaveform(this.waveform, this.waveformPeaks, {
            width,
            height,
            pixelRatio: window.devicePixelRatio || 1,
            amplitudeScale: fraction => this.getSectionAtFrame(this.getFrameIndex(fraction * this.duration))?.volume ?? 1
        });
    }

    /** Updates the timeline display. */
    updateTimeline() {
        let start = this.duration > 0 ? this.trimStart / this.duration * 100 : 0;
        let end = this.duration > 0 ? this.trimEnd / this.duration * 100 : 100;
        this.currentFrameIndex = this.getFrameIndex(this.video.currentTime);
        this.videoControls.setVolumeMultiplier(this.getSectionAtFrame(this.currentFrameIndex)?.volume ?? 1);
        let currentTime = this.currentFrameIndex / this.frameRate;
        let current = this.duration > 0 ? currentTime / this.duration * 100 : 0;
        this.timelineSelection.style.left = `${start}%`;
        this.timelineSelection.style.width = `${Math.max(0, end - start)}%`;
        this.timelineExcludedLeft.style.left = '0';
        this.timelineExcludedLeft.style.width = `${start}%`;
        this.timelineExcludedRight.style.left = `${end}%`;
        this.timelineExcludedRight.style.width = `${Math.max(0, 100 - end)}%`;
        this.timelineCursor.style.left = `${Math.max(0, Math.min(100, current))}%`;
        this.trimHandleLeft.style.left = `${start}%`;
        this.trimHandleRight.style.left = `${end}%`;
        this.trimStartText.textContent = `Start: ${durationStringifyColons(this.trimStart, 2)}`;
        this.currentTimeText.textContent = `Position: ${durationStringifyColons(currentTime, 2)} (Frame ${this.currentFrameIndex})`;
        this.trimEndText.textContent = `End: ${durationStringifyColons(this.trimEnd, 2)}`;
        this.durationText.textContent = `Duration: ${durationStringifyColons(this.trimEnd - this.trimStart, 2)}`;
        this.updateSplitMarkButton();
        this.updateSectionControls();
    }

    /** Returns the split mark at an exact frame index, if any. */
    getSplitMarkIndexAtFrame(frameIndex) {
        return this.splitFrames.indexOf(frameIndex);
    }

    /** Rebuilds the split mark list from the section boundaries. */
    syncSplitFrames() {
        this.splitFrames = this.sections.slice(0, -1).map(section => section.endFrame);
    }

    /** Returns the section containing a frame, treating a split frame as the start of its right section. */
    getSectionAtFrame(frameIndex) {
        return this.sections.find((section, index) => frameIndex >= section.startFrame && (frameIndex < section.endFrame || index == this.sections.length - 1)) || null;
    }

    /** Adds or removes a split mark at the current timeline position. */
    toggleSplitMark() {
        if (this.duration <= 0) {
            return;
        }
        this.currentFrameIndex = this.getFrameIndex(this.video.currentTime);
        let index = this.getSplitMarkIndexAtFrame(this.currentFrameIndex);
        if (index == -1) {
            let sectionIndex = this.sections.findIndex(section => this.currentFrameIndex > section.startFrame && this.currentFrameIndex < section.endFrame);
            if (sectionIndex == -1) {
                return;
            }
            let section = this.sections[sectionIndex];
            this.sections.splice(sectionIndex, 1, section.clone(section.startFrame, this.currentFrameIndex), section.clone(this.currentFrameIndex, section.endFrame));
        }
        else {
            let leftSection = this.sections[index];
            let rightSection = this.sections[index + 1];
            this.sections.splice(index, 2, new MediaEditorSection(leftSection.startFrame, rightSection.endFrame));
        }
        this.syncSplitFrames();
        this.renderSections();
        this.redrawAudioWaveform();
        this.renderSplitMarks();
        this.updateSplitMarkButton();
        this.updateSectionControls();
        this.saveVideoButton.disabled = false;
    }

    /** Renders all split marks over the timeline waveform. */
    renderSplitMarks() {
        this.splitMarksContainer.replaceChildren();
        if (this.duration <= 0) {
            return;
        }
        for (let frameIndex of this.splitFrames) {
            let mark = createDiv(null, 'video_editor_split_mark');
            mark.style.left = `${Math.min(100, frameIndex / this.frameRate / this.duration * 100)}%`;
            this.splitMarksContainer.appendChild(mark);
        }
    }

    /** Renders section-specific timeline state. */
    renderSections() {
        this.sectionsContainer.replaceChildren();
        if (this.duration <= 0) {
            return;
        }
        for (let section of this.sections) {
            let left = section.startFrame / this.frameRate / this.duration * 100;
            let width = (section.endFrame - section.startFrame) / this.frameRate / this.duration * 100;
            let volume = Math.max(0, Math.min(1, section.volume));
            let reductionHeight = (1 - volume) * 50;
            if (reductionHeight > 0) {
                let topReduction = createDiv(null, 'video_editor_section_volume_reduction');
                topReduction.style.left = `${left}%`;
                topReduction.style.width = `${width}%`;
                topReduction.style.top = '0';
                topReduction.style.height = `${reductionHeight}%`;
                this.sectionsContainer.appendChild(topReduction);
                let bottomReduction = createDiv(null, 'video_editor_section_volume_reduction');
                bottomReduction.style.left = `${left}%`;
                bottomReduction.style.width = `${width}%`;
                bottomReduction.style.bottom = '0';
                bottomReduction.style.height = `${reductionHeight}%`;
                this.sectionsContainer.appendChild(bottomReduction);
            }
            if (section.excluded) {
                let highlight = createDiv(null, 'video_editor_section_excluded');
                highlight.style.left = `${left}%`;
                highlight.style.width = `${width}%`;
                this.sectionsContainer.appendChild(highlight);
            }
        }
    }

    /** Updates the split mark button for the current timeline position. */
    updateSplitMarkButton() {
        let hasMark = this.duration > 0 && this.getSplitMarkIndexAtFrame(this.currentFrameIndex) != -1;
        this.splitMarkButton.textContent = translate(hasMark ? 'Remove Split Mark' : 'Add Split Mark');
    }

    /** Updates the controls for the section under the cursor. */
    updateSectionControls() {
        let section = this.getSectionAtFrame(this.currentFrameIndex);
        this.sectionControls.style.display = this.splitFrames.length > 0 ? '' : 'none';
        this.excludeSectionButton.textContent = translate(section?.excluded ? 'Include Section' : 'Exclude Section');
        this.sectionVolumeSlider.value = (section?.volume ?? 1) * 100;
        this.sectionVolumeValue.textContent = `${Math.round((section?.volume ?? 1) * 100)}%`;
        updateRangeStyle(this.sectionVolumeSlider);
    }

    /** Includes or excludes the section under the timeline cursor. */
    toggleExcludeSection() {
        if (this.splitFrames.length == 0) {
            return;
        }
        let section = this.getSectionAtFrame(this.getFrameIndex(this.video.currentTime));
        if (!section) {
            return;
        }
        section.excluded = !section.excluded;
        this.video.pause();
        this.renderSections();
        this.updateSectionControls();
        this.saveVideoButton.disabled = false;
    }

    /** Stores the selected section's output volume as a multiplier. */
    onSectionVolumeChanged() {
        let section = this.getSectionAtFrame(this.currentFrameIndex);
        if (!section) {
            return;
        }
        section.volume = parseFloat(this.sectionVolumeSlider.value) / 100;
        this.videoControls.setVolumeMultiplier(section.volume);
        this.sectionVolumeValue.textContent = `${Math.round(section.volume * 100)}%`;
        this.renderSections();
        this.redrawAudioWaveform();
        this.saveVideoButton.disabled = false;
    }

    /** Skips excluded content during active playback. */
    onTimeUpdate() {
        if (!this.video.paused) {
            let section = this.getSectionAtFrame(this.getFrameIndex(this.video.currentTime));
            if (section?.excluded) {
                let nextFrame = this.skipExcludedFrame(section.endFrame, 1);
                if (nextFrame >= this.getFrameIndex(this.duration)) {
                    this.video.pause();
                    this.video.currentTime = this.duration;
                }
                else {
                    this.video.currentTime = nextFrame / this.frameRate;
                }
            }
        }
        this.updateTimeline();
    }

    /** Moves a target frame out of excluded sections in the requested direction. */
    skipExcludedFrame(frameIndex, direction) {
        let section = this.getSectionAtFrame(frameIndex);
        while (section?.excluded) {
            if (direction > 0 && section.endFrame >= this.getFrameIndex(this.duration)) {
                return this.getFrameIndex(this.duration);
            }
            frameIndex = direction > 0 ? section.endFrame : section.startFrame - 1;
            section = this.getSectionAtFrame(frameIndex);
        }
        return frameIndex;
    }

    /** Moves the timeline cursor by an exact number of frames. */
    stepFrames(offset) {
        if (this.duration <= 0) {
            return;
        }
        this.video.pause();
        let maxFrameIndex = this.getFrameIndex(this.duration);
        let frameIndex = Math.max(0, Math.min(maxFrameIndex, this.getFrameIndex(this.video.currentTime) + offset));
        frameIndex = Math.max(0, Math.min(maxFrameIndex, this.skipExcludedFrame(frameIndex, offset)));
        this.video.currentTime = Math.min(this.duration, frameIndex / this.frameRate);
        this.updateTimeline();
    }

    /** Handles media editor keyboard shortcuts. */
    onKeyDown(e) {
        if (!this.modal.classList.contains('show') || e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }
        if (e.key.toLowerCase() == 's' && !e.repeat) {
            this.toggleSplitMark();
        }
        else if (e.key == 'ArrowLeft') {
            this.stepFrames(-1);
        }
        else if (e.key == 'ArrowRight') {
            this.stepFrames(1);
        }
        else if (e.code == 'Space' && !e.repeat) {
            this.videoControls.togglePlay();
        }
        else if (e.key == 'Delete' && !e.repeat) {
            this.toggleExcludeSection();
        }
        else {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
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
            let frameIndex = this.getFrameIndex(time);
            if (frameIndex != this.getFrameIndex(this.video.currentTime)) {
                this.video.currentTime = Math.min(this.duration, frameIndex / this.frameRate);
            }
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
        let stageRect = this.stage.getBoundingClientRect();
        let stageMinX = (stageRect.left - rect.left) / rect.width;
        let stageMaxX = (stageRect.right - rect.left) / rect.width;
        let stageMinY = (stageRect.top - rect.top) / rect.height;
        let stageMaxY = (stageRect.bottom - rect.top) / rect.height;
        let x = Math.max(stageMinX, Math.min(stageMaxX, (e.clientX - rect.left) / rect.width));
        let y = Math.max(stageMinY, Math.min(stageMaxY, (e.clientY - rect.top) / rect.height));
        if (!e.shiftKey) {
            x = roundTo(x * this.video.videoWidth, 8) / this.video.videoWidth;
            y = roundTo(y * this.video.videoHeight, 8) / this.video.videoHeight;
        }
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

    /** Returns the ordered timeline sections for the media editing API. */
    getSectionsRequest() {
        let result = this.sections.map(section => section.toRequest(this.frameRate));
        if (result.length > 0) {
            result[result.length - 1].endMilliseconds = Math.round(this.duration * 1000);
        }
        return result;
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
        this.excludeSectionButton.disabled = saving;
        this.saveAudioButton.disabled = saving;
        this.saveVideoButton.disabled = saving;
    }

    /** Adds a saved edit to the Batch View. */
    addOutputToBatch(result) {
        let outputSrc = `${getImageOutPrefix()}/${result.result}`;
        let batchDiv = mainGenHandler.gotImageResult(outputSrc, '{}', '0');
        if (batchDiv && isAudioExt(outputSrc)) {
            mainGenHandler.setImageFor({ div: batchDiv, image: outputSrc }, outputSrc);
        }
        if (inputBrowserHelper.inputImageBrowser) {
            inputBrowserHelper.inputImageBrowser.lightRefresh();
        }
    }

    /** Saves the edited audio track as a Batch View output. */
    saveAudio() {
        if (!this.videoData || this.duration <= 0) {
            return;
        }
        this.setSaving(true);
        let request = { media: this.videoData, filename: this.filename, audioOnly: true, ...this.getTrimRequest(), timelineSections: this.getSectionsRequest() };
        genericRequest('EditMedia', request, result => {
            this.addOutputToBatch(result);
            this.setSaving(false);
            this.saveAudioButton.style.display = 'none';
        }, 0, error => {
            this.setSaving(false);
            showError(error);
        });
    }

    /** Saves the edited media as a Batch View output. */
    saveMedia() {
        if (!this.videoData || this.duration <= 0) {
            return;
        }
        this.setSaving(true);
        let request = { media: this.videoData, filename: this.filename, audioOnly: this.isAudio, ...this.getTrimRequest(), ...this.getCropRequest(), scale: this.getScale(), timelineSections: this.getSectionsRequest() };
        genericRequest('EditMedia', request, result => {
            this.addOutputToBatch(result);
            this.setSaving(false);
            this.saveVideoButton.disabled = true;
        }, 0, error => {
            this.setSaving(false);
            showError(error);
        });
    }
}

let mediaEditorInterface = new MediaEditorInterface();
