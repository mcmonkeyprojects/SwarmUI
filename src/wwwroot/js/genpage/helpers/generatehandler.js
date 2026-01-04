class GenerateHandler {

    constructor() {
        this.batchesEver = 0;
        this.totalGensThisRun = 0;
        this.totalGenRunTime = 0;
        this.validateModel = true;
        this.interrupted = -1;
        this.sockets = {};
        this.imageContainerDivId = 'current_image';
        this.imageId = 'current_image_img';
        this.progressBarHtml = `<div class="image-preview-progress-inner"><div class="image-preview-progress-overall"></div><div class="image-preview-progress-current"></div></div>`;
        this.batchDiv = document.getElementById('current_image_batch');
    }

    resetBatchIfNeeded() {
        resetBatchIfNeeded();
    }

    getGenInput(input_overrides = {}, input_preoverrides = {}) {
        return getGenInput(input_overrides, input_preoverrides);
    }

    setCurrentImage(src, metadata = '', batchId = '', previewGrow = false, smoothAdd = false) {
        setCurrentImage(src, metadata, batchId, previewGrow, smoothAdd);
    }

    gotImageResult(image, metadata, batchId) {
        return gotImageResult(image, metadata, batchId);
    }

    gotTrackedImageResult(image, metadata, batchId, existingDiv = null) {
        let curImgElem = document.getElementById(this.imageId);
        if (!curImgElem || autoLoadImagesElem.checked || curImgElem.dataset.batch_id == batchId) {
            this.setCurrentImage(image, metadata, batchId, false, true);
        }
        if ((getUserSetting('AutoSwapImagesIncludesFullView') || imageFullView.currentBatchId == batchId) && imageFullView.isOpen()) {
            imageFullView.showImage(image, metadata, batchId);
        }
    }

    gotImagePreview(image, metadata, batchId) {
        return gotImagePreview(image, metadata, batchId);
    }

    gotTrackedImagePreview(image, metadata, batchId) {
    }

    gotProgress(current, overall, batchId) {
        // nothing to do here
    }

    hadError(msg) {
        showError(msg);
    }

    appendGenTimeFrom(time) {
        this.totalGensThisRun++;
        this.totalGenRunTime += time;
    }

    beforeGenRun() {
        num_waiting_gens += parseInt(getRequiredElementById('input_images').value);
    }

    doInterrupt(allSessions = false) {
        this.interrupted = this.batchesEver;
        doInterrupt(allSessions);
    }

    doInterruptAndGen() {
        this.doInterrupt();
        getSession(() => {
            this.doGenerate();
        });
    }

    doGenerateButton(e) {
        if (e.altKey) {
            this.doInterruptAndGen();
        }
        else {
            this.doGenerate();
        }
    }

    getBatchId() {
        return ++this.batchesEver;
    }

    setImageFor(imgHolder, src) {
        if (imgHolder.div.dataset.is_placeholder) {
            delete imgHolder.div.dataset.is_placeholder;
            imgHolder.div.classList.remove('image-block-placeholder');
        }
        let imgElem = imgHolder.div.querySelector('img');
        let vid = imgHolder.div.querySelector('video');
        if (vid) {
            vid.remove();
        }
        let isVideo = isVideoExt(src);
        let isAudio = isAudioExt(src);
        if (isVideo) {
            if (imgElem) {
                imgElem.remove();
            }
            vid = document.createElement('video');
            vid.loop = true;
            vid.autoplay = true;
            vid.muted = true;
            vid.width = 16 * 10;
            let sourceObj = document.createElement('source');
            sourceObj.src = src;
            sourceObj.type = isVideo;
            vid.appendChild(sourceObj);
            imgHolder.div.appendChild(vid);
        }
        else if (isAudio) {
            if (imgElem) {
                imgElem.remove();
            }
            imgElem = document.createElement('audio');
            imgElem.controls = true;
            imgElem.src = src;
            imgHolder.div.appendChild(imgElem);
        }
        else {
            imgElem.src = src;
        }
        imgHolder.image = src;
        imgHolder.div.dataset.src = src;
    }

    getDiv(imgHolder) {
        if (imgHolder.div && imgHolder.div.parentElement) {
            return imgHolder.div;
        }
        if (imgHolder.batchId) {
            return this.batchDiv.querySelector(`[data-batch_id="${imgHolder.batchId}"]`);
        }
        return null;
    }

    internalHandleData(data, images, discardable, timeLastGenHit, actualInput, socketId, socket, isPreview, batch_id) {
        if ('socket_intention' in data && data.socket_intention == 'close' && socket) {
            if (this.sockets[socketId] == socket) {
                this.sockets[socketId] = null;
            }
            if (this.interrupted < batch_id || getUserSetting('ui.removeinterruptedgens', false)) {
                // clear any lingering previews
                for (let img of Object.values(images)) {
                    let div = this.getDiv(img);
                    if (div) {
                        div.remove();
                    }
                }
                playCompletionAudio();
            }
            return;
        }
        if (isPreview) {
            if (data.image) {
                this.setCurrentImage(data.image, data.metadata, `${data.request_id}_${data.batch_index}`, false, true);
            }
            return;
        }
        if (data.image) {
            let timeNow = Date.now();
            let timeDiff = timeNow - timeLastGenHit[0];
            timeLastGenHit[0] = timeNow;
            this.appendGenTimeFrom(timeDiff / 1000);
            let imgHolder = images[data.batch_index];
            let div = imgHolder ? this.getDiv(imgHolder) : null;
            if (!div) {
                let batch_div = this.gotImageResult(data.image, data.metadata, `${data.request_id}_${data.batch_index}`);
                if (batch_div) {
                    images[data.batch_index] = {div: batch_div, image: data.image, metadata: data.metadata, overall_percent: 0, current_percent: 0};
                }
            }
            else {
                this.gotTrackedImageResult(data.image, data.metadata, `${data.request_id}_${data.batch_index}`, div);
                let imgElem = div.querySelector('img');
                this.setImageFor(imgHolder, data.image);
                let spinner = div.querySelector('.loading-spinner-parent');
                if (spinner) {
                    spinner.remove();
                }
                delete imgElem.dataset.previewGrow;
                div.dataset.metadata = data.metadata;
                let progress_bars = div.querySelector('.image-preview-progress-wrapper');
                if (progress_bars) {
                    progress_bars.remove();
                }
                this.gotProgress(-1, -1, `${data.request_id}_${data.batch_index}`);
            }
            if (data.batch_index in images) {
                images[data.batch_index].image = data.image;
                if (data.metadata) {
                    images[data.batch_index].metadata = data.metadata;
                }
                discardable[data.batch_index] = images[data.batch_index];
                delete images[data.batch_index];
            }
        }
        if (data.gen_progress) {
            let thisBatchId = `${data.gen_progress.request_id}_${data.gen_progress.batch_index}`;
            let metadataRaw = data.gen_progress.metadata ?? '{}';
            if (!(data.gen_progress.batch_index in images)) {
                let metadataParsed = JSON.parse(metadataRaw);
                let batch_div = this.gotImagePreview(data.gen_progress.preview ?? `DOPLACEHOLDER:${metadataParsed.sui_image_params?.model || actualInput.model || ''}`, metadataRaw, thisBatchId);
                if (batch_div) {
                    images[data.gen_progress.batch_index] = {div: batch_div, image: null, metadata: metadataRaw, overall_percent: 0, current_percent: 0};
                    let progress_bars = createDiv(null, 'image-preview-progress-wrapper', this.progressBarHtml);
                    batch_div.prepend(progress_bars);
                }
            }
            else if (data.gen_progress.preview) {
                this.gotTrackedImagePreview(data.gen_progress.preview, metadataRaw, thisBatchId);
            }
            if (data.gen_progress.batch_index in images) {
                let imgHolder = images[data.gen_progress.batch_index];
                let div = this.getDiv(imgHolder);
                let overall = div ? div.querySelector('.image-preview-progress-overall') : null;
                if (overall && data.gen_progress.overall_percent) {
                    imgHolder.overall_percent = data.gen_progress.overall_percent;
                    imgHolder.current_percent = data.gen_progress.current_percent;
                    overall.style.width = `${imgHolder.overall_percent * 100}%`;
                    div.querySelector('.image-preview-progress-current').style.width = `${imgHolder.current_percent * 100}%`;
                    if (data.gen_progress.preview && autoLoadPreviewsElem.checked && imgHolder.image == null) {
                        this.setCurrentImage(data.gen_progress.preview, imgHolder.metadata, thisBatchId, true);
                    }
                    let curImgElem = document.getElementById(this.imageId);
                    if (data.gen_progress.preview && (!imgHolder.image || data.gen_progress.preview != imgHolder.image)) {
                        if (curImgElem && curImgElem.dataset.batch_id == thisBatchId) {
                            currentImgSrc = data.gen_progress.preview;
                            curImgElem.src = currentImgSrc;
                            curImgElem.dataset.src = currentImgSrc;
                        }
                        this.setImageFor(imgHolder, data.gen_progress.preview);
                        if (imageFullView.isOpen() && imageFullView.currentBatchId == thisBatchId) {
                            imageFullView.getImg().src = data.gen_progress.preview;
                        }
                    }
                }
            }
            this.gotProgress(data.gen_progress.current_percent, data.gen_progress.overall_percent, thisBatchId);
        }
        if (data.discard_indices) {
            let needsNew = false;
            for (let index of data.discard_indices) {
                let img = discardable[index] ?? images[index];
                if (img) {
                    let div = this.getDiv(img);
                    if (div) {
                        div.remove();
                    }
                    let curImgElem = document.getElementById(this.imageId);
                    if (curImgElem && curImgElem.src == img.image) {
                        needsNew = true;
                        delete discardable[index];
                    }
                }
            }
            if (needsNew) {
                let imgs = Object.values(discardable);
                if (imgs.length > 0) {
                    this.setCurrentImage(imgs[0].image, imgs[0].metadata);
                }
            }
        }
    }

    doGenerate(input_overrides = {}, input_preoverrides = {}, postCollectRun = null) {
        if (session_id == null) {
            if (Date.now() - time_started > 1000 * 60) {
                this.hadError("Cannot generate, session not started. Did the server crash?");
            }
            else {
                this.hadError("Cannot generate, session not started. Please wait a moment for the page to load.");
            }
            return;
        }
        let socketId = 'normal';
        let isPreview = '_preview' in input_overrides;
        if (isPreview) {
            delete input_overrides['_preview'];
            socketId = 'preview';
        }
        this.beforeGenRun();
        let run = () => {
            this.resetBatchIfNeeded();
            let images = {};
            let batch_id = this.getBatchId();
            let discardable = {};
            let timeLastGenHit = [Date.now()];
            let actualInput = this.getGenInput(input_overrides, input_preoverrides);
            let socket = null;
            let handleError = e => {
                console.log(`Error in GenerateText2ImageWS:`, e, this.interrupted, batch_id);
                setTimeout(() => {
                    for (let imgHolder of Object.values(images)) {
                        let div = this.getDiv(imgHolder);
                        if (div) {
                            let spinner = div.querySelector('.loading-spinner-parent');
                            if (spinner) {
                                spinner.remove();
                                let failIcon = createDiv(null, 'image-block-failed');
                                div.appendChild(failIcon);
                            }
                            let progress_bars = div.querySelector('.image-preview-progress-wrapper');
                            if (progress_bars) {
                                progress_bars.remove();
                            }
                        }
                    }
                }, 1);
                if (this.interrupted >= batch_id) {
                    return;
                }
                this.hadError(e);
            };
            if (postCollectRun) {
                postCollectRun(actualInput);
            }
            if (this.sockets[socketId] && this.sockets[socketId].readyState == WebSocket.OPEN) {
                this.sockets[socketId].send(JSON.stringify(actualInput));
            }
            else {
                socket = makeWSRequestT2I('GenerateText2ImageWS', actualInput, data => this.internalHandleData(data, images, discardable, timeLastGenHit, actualInput, socketId, socket, isPreview, batch_id), handleError);
                this.sockets[socketId] = socket;
            }
        };
        if (this.validateModel) {
            if (getRequiredElementById('current_model').value == '') {
                this.hadError("Cannot generate, no model selected.");
                return;
            }
            currentModelHelper.ensureCurrentModel(() => {
                if (currentModelHelper.doModelInstallRequiredCheck()) {
                    return;
                }
                run();
            });
        }
        else {
            run();
        }
    }
}
