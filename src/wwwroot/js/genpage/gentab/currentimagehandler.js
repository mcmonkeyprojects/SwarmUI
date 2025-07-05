
/** Central helper class to handle the 'image full view' modal. */
class ImageFullViewHelper {
    constructor() {
        this.zoomRate = 1.1;
        this.modal = getRequiredElementById('image_fullview_modal');
        this.content = getRequiredElementById('image_fullview_modal_content');
        this.modalJq = $('#image_fullview_modal');
        this.noClose = false;
        document.addEventListener('click', (e) => {
            if (e.target.tagName == 'BODY') {
                return; // it's impossible on the genpage to actually click body, so this indicates a bugged click, so ignore it
            }
            if (!this.noClose && this.modal.style.display == 'block' && !findParentOfClass(e.target, 'imageview_popup_modal_undertext') && !findParentOfClass(e.target, 'image_fullview_extra_buttons')) {
                this.close();
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            this.noClose = false;
        }, true);
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.isDragging = false;
        this.didDrag = false;
        this.content.addEventListener('wheel', this.onWheel.bind(this));
        this.content.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mouseup', this.onGlobalMouseUp.bind(this));
        document.addEventListener('mousemove', this.onGlobalMouseMove.bind(this));
        this.fixButtonDelay = null;
        this.lastClosed = 0;
    }

    getImg() {
        return getRequiredElementById('imageview_popup_modal_img');
    }

    getHeightPercent() {
        return parseFloat((this.getImg().style.height || '100%').replaceAll('%', ''));
    }

    getImgLeft() {
        return parseFloat((this.getImg().style.left || '0').replaceAll('px', ''));
    }

    getImgTop() {
        return parseFloat((this.getImg().style.top || '0').replaceAll('px', ''));
    }

    onMouseDown(e) {
        if (this.modal.style.display != 'block') {
            return;
        }
        if (e.button == 2) { // right-click
            return;
        }
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.isDragging = true;
        this.getImg().style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
    }

    onGlobalMouseUp(e) {
        if (!this.isDragging) {
            return;
        }
        this.getImg().style.cursor = 'grab';
        this.isDragging = false;
        this.noClose = this.didDrag;
        this.didDrag = false;
    }

    moveImg(xDiff, yDiff) {
        let img = this.getImg();
        let newLeft = this.getImgLeft() + xDiff;
        let newTop = this.getImgTop() + yDiff;
        let overWidth = img.parentElement.offsetWidth / 2;
        let overHeight = img.parentElement.offsetHeight / 2;
        newLeft = Math.min(overWidth, Math.max(newLeft, img.parentElement.offsetWidth - img.offsetWidth - overWidth));
        newTop = Math.min(overHeight, Math.max(newTop, img.parentElement.offsetHeight - img.offsetHeight - overHeight));
        img.style.left = `${newLeft}px`;
        img.style.top = `${newTop}px`;
    }

    onGlobalMouseMove(e) {
        if (!this.isDragging) {
            return;
        }
        this.detachImg();
        let xDiff = e.clientX - this.lastMouseX;
        let yDiff = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.moveImg(xDiff, yDiff);
        if (Math.abs(xDiff) > 1 || Math.abs(yDiff) > 1) {
            this.didDrag = true;
        }
    }

    detachImg() {
        let wrap = getRequiredElementById('imageview_modal_imagewrap');
        if (wrap.style.textAlign == 'center') {
            let img = this.getImg();
            wrap.style.textAlign = 'left';
            let width = img.naturalWidth ?? img.videoWidth;
            let height = img.naturalHeight ?? img.videoHeight;
            let imgAspectRatio = width / height;
            let wrapAspectRatio = wrap.offsetWidth / wrap.offsetHeight;
            let targetWidth = wrap.offsetHeight * imgAspectRatio;
            if (targetWidth > wrap.offsetWidth) {
                img.style.top = `${(wrap.offsetHeight - (wrap.offsetWidth / imgAspectRatio)) / 2}px`;
                img.style.height = `${(wrapAspectRatio / imgAspectRatio) * 100}%`;
                img.style.left = '0px';
            }
            else {
                img.style.top = '0px';
                img.style.left = `${(wrap.offsetWidth - targetWidth) / 2}px`;
                img.style.height = `100%`;
            }
            img.style.objectFit = '';
            img.style.maxWidth = '';
        }
    }

    copyState() {
        let img = this.getImg();
        if (img.style.objectFit) {
            return {};
        }
        return {
            left: this.getImgLeft(),
            top: this.getImgTop(),
            height: this.getHeightPercent()
        };
    }

    pasteState(state) {
        if (!state || !state.left) {
            return;
        }
        let img = this.getImg();
        this.detachImg();
        img.style.left = `${state.left}px`;
        img.style.top = `${state.top}px`;
        img.style.height = `${state.height}%`;
    }

    onWheel(e) {
        this.detachImg();
        let img = this.getImg();
        let origHeight = this.getHeightPercent();
        let zoom = Math.pow(this.zoomRate, -e.deltaY / 100);
        let width = img.naturalWidth ?? img.videoWidth;
        let height = img.naturalHeight ?? img.videoHeight;
        let maxHeight = Math.sqrt(width * height) * 2;
        let newHeight = Math.max(10, Math.min(origHeight * zoom, maxHeight));
        if (newHeight > maxHeight / 5) {
            img.style.imageRendering = 'pixelated';
        }
        else {
            img.style.imageRendering = '';
        }
        img.style.cursor = 'grab';
        let [imgLeft, imgTop] = [this.getImgLeft(), this.getImgTop()];
        let [mouseX, mouseY] = [e.clientX - img.offsetLeft, e.clientY - img.offsetTop];
        let [origX, origY] = [mouseX / origHeight - imgLeft, mouseY / origHeight - imgTop];
        let [newX, newY] = [mouseX / newHeight - imgLeft, mouseY / newHeight - imgTop];
        this.moveImg((newX - origX) * newHeight, (newY - origY) * newHeight);
        img.style.height = `${newHeight}%`;
    }

    showImage(src, metadata) {
        this.currentSrc = src;
        this.currentMetadata = metadata;
        let isVideo = isVideoExt(src);
        let encodedSrc = escapeHtmlForUrl(src);
        let imgHtml = `<img class="imageview_popup_modal_img" id="imageview_popup_modal_img" style="cursor:grab;max-width:100%;object-fit:contain;" src="${encodedSrc}">`;
        if (isVideo) {
            imgHtml = `<video class="imageview_popup_modal_img" id="imageview_popup_modal_img" style="cursor:grab;max-width:100%;object-fit:contain;" autoplay loop muted><source src="${encodedSrc}" type="video/${encodedSrc.substring(encodedSrc.lastIndexOf('.') + 1)}"></video>`;
        }
        this.content.innerHTML = `
        <div class="modal-dialog" style="display:none">(click outside image to close)</div>
        <div class="imageview_modal_inner_div">
            <div class="imageview_modal_imagewrap" id="imageview_modal_imagewrap" style="text-align:center;">
                ${imgHtml}
            </div>
            <div class="imageview_popup_modal_undertext">
                <div class="image_fullview_extra_buttons"></div>
                ${formatMetadata(metadata)}
            </div>
        </div>`;
        let subDiv = this.content.querySelector('.image_fullview_extra_buttons');
        for (let added of buttonsForImage(getImageFullSrc(src), src, metadata)) {
            if (added.href) {
                if (added.is_download) {
                    subDiv.appendChild(createDiv(null, 'inline-block', `<a class="text_button basic-button translate" href="${added.href}" title="${added.title}" download>${added.label}</a>`));
                }
                else {
                    subDiv.appendChild(createDiv(null, 'inline-block', `<a class="text_button basic-button translate" href="${added.href}" title="${added.title}">${added.label}</a>`));
                }
            }
            else {
                quickAppendButton(subDiv, added.label, (e, button) => added.onclick(button), '', added.title);
            }
        }
        this.modalJq.modal('show');
        if (this.fixButtonDelay) {
            clearTimeout(this.fixButtonDelay);
        }
        if (Date.now() - this.lastClosed > 200) {
            subDiv.style.pointerEvents = 'none';
            for (let button of subDiv.getElementsByTagName('button')) {
                button.disabled = true;
                button.classList.add('simpler-button-disable');
            }
            this.fixButtonDelay = setTimeout(() => {
                if (subDiv && subDiv.parentElement) {
                    subDiv.style.pointerEvents = 'auto';
                    for (let button of subDiv.getElementsByTagName('button')) {
                        button.disabled = false;
                    }
                }
                this.fixButtonDelay = null;
            }, 500);
        }
    }

    close() {
        if (!this.isOpen()) {
            return;
        }
        this.isDragging = false;
        this.didDrag = false;
        this.modalJq.modal('hide');
        this.lastClosed = Date.now();
    }

    isOpen() {
        return this.modalJq.is(':visible');
    }
}

let imageFullView = new ImageFullViewHelper();

/** Called when the user clicks the clear batch button. */
function clearBatch() {
    let currentImageBatchDiv = getRequiredElementById('current_image_batch');
    currentImageBatchDiv.innerHTML = '';
    currentImageBatchDiv.dataset.numImages = 0;
}

/** Reference to the auto-clear-batch toggle checkbox. */
let autoClearBatchElem = getRequiredElementById('auto_clear_batch_checkbox');
autoClearBatchElem.checked = localStorage.getItem('autoClearBatch') == 'true';
/** Called when the user changes auto-clear-batch toggle to update local storage. */
function toggleAutoClearBatch() {
    localStorage.setItem('autoClearBatch', `${autoClearBatchElem.checked}`);
}

/** Reference to the auto-load-previews toggle checkbox. */
let autoLoadPreviewsElem = getRequiredElementById('auto_load_previews_checkbox');
autoLoadPreviewsElem.checked = localStorage.getItem('autoLoadPreviews') == 'true';
/** Called when the user changes auto-load-previews toggle to update local storage. */
function toggleAutoLoadPreviews() {
    localStorage.setItem('autoLoadPreviews', `${autoLoadPreviewsElem.checked}`);
}

/** Reference to the auto-load-images toggle checkbox. */
let autoLoadImagesElem = getRequiredElementById('auto_load_images_checkbox');
autoLoadImagesElem.checked = localStorage.getItem('autoLoadImages') != 'false';
/** Called when the user changes auto-load-images toggle to update local storage. */
function toggleAutoLoadImages() {
    localStorage.setItem('autoLoadImages', `${autoLoadImagesElem.checked}`);
}

/** Reference to the auto-clear-batch toggle checkbox. */
let showLoadSpinnersElem = getRequiredElementById('show_load_spinners_checkbox');
showLoadSpinnersElem.checked = localStorage.getItem('showLoadSpinners') != 'false';
/** Called when the user changes show-load-spinners toggle to update local storage. */
function toggleShowLoadSpinners() {
    localStorage.setItem('showLoadSpinners', `${showLoadSpinnersElem.checked}`);
}

/** Reference to the separate-batches toggle checkbox. */
let separateBatchesElem = getRequiredElementById('separate_batches_checkbox');
separateBatchesElem.checked = localStorage.getItem('separateBatches') == 'true';
/** Called when the user changes separate-batches toggle to update local storage. */
function toggleSeparateBatches() {
    localStorage.setItem('separateBatches', `${separateBatchesElem.checked}`);
}

function clickImageInBatch(div) {
    let imgElem = div.getElementsByTagName('img')[0];
    if (currentImgSrc == div.dataset.src) {
        imageFullView.showImage(div.dataset.src, div.dataset.metadata);
        return;
    }
    setCurrentImage(div.dataset.src, div.dataset.metadata, div.dataset.batch_id ?? '', imgElem && imgElem.dataset.previewGrow == 'true', false, true, div.dataset.is_placeholder == 'true');
}

function rightClickImageInBatch(e, div) {
    if (e.shiftKey || e.ctrlKey) {
        return;
    }
    let src = div.dataset.src;
    let fullsrc = getImageFullSrc(src);
    let metadata = div.dataset.metadata;
    let popoverActions = [];
    for (let added of buttonsForImage(fullsrc, src, metadata)) {
        if (added.href) {
            popoverActions.push({ key: added.label, href: added.href, is_download: added.is_download, title: added.title });
        }
        else {
            popoverActions.push({ key: added.label, action: added.onclick, title: added.title });
        }
    }
    popoverActions.push({ key: 'Remove From Batch View', action: () => div.remove() })
    let popover = new AdvancedPopover('image_batch_context_menu', popoverActions, false, mouseX, mouseY, document.body, null);
    e.preventDefault();
    e.stopPropagation();
    return false;
}

/** "Reuse Parameters" button impl. */
function copy_current_image_params() {
    if (!currentMetadataVal) {
        alert('No parameters to copy!');
        return;
    }
    let readable = interpretMetadata(currentMetadataVal);
    let metadataFull = JSON.parse(readable);
    let metadata = metadataFull.sui_image_params;
    let extra = metadataFull.sui_extra_data || metadata;
    if ('original_prompt' in extra) {
        metadata.prompt = extra.original_prompt;
    }
    if ('original_negativeprompt' in extra) {
        metadata.negativeprompt = extra.original_negativeprompt;
    }
    // Special hacks to repair edge cases in LoRA reuse
    // There should probably just be a direct "for lora in list, set lora X with weight Y" instead of this
    if ('lorasectionconfinement' in metadata && 'loras' in metadata && 'loraweights' in metadata) {
        let confinements = metadata.lorasectionconfinement;
        let loras = metadata.loras;
        let weights = metadata.loraweights;
        if (confinements.length == loras.length && loras.length == weights.length) {
            let newLoras = [];
            let newWeights = [];
            for (let i = 0; i < confinements.length; i++) {
                if (confinements[i] == -1) {
                    newLoras.push(loras[i]);
                    newWeights.push(weights[i]);
                }
            }
            metadata.loras = newLoras;
            metadata.loraweights = newWeights;
            delete metadata.lorasectionconfinement;
        }
    }
    if ('loras' in metadata && 'loraweights' in metadata && document.getElementById('input_loras') && metadata.loras.length == metadata.loraweights.length) {
        let loraElem = getRequiredElementById('input_loras');
        for (let val of metadata.loras) {
            if (val && !$(loraElem).find(`option[value="${val}"]`).length) {
                $(loraElem).append(new Option(val, val, false, false));
            }
        }
        let valSet = [...loraElem.options].map(option => option.value);
        let newLoras = [];
        let newWeights = [];
        for (let val of valSet) {
            let index = metadata.loras.indexOf(val);
            if (index != -1) {
                newLoras.push(metadata.loras[index]);
                newWeights.push(metadata.loraweights[index]);
            }
        }
        metadata.loras = newLoras;
        metadata.loraweights = newWeights;
    }
    if (!('aspectratio' in metadata) && 'width' in metadata && 'height' in metadata) {
        metadata.aspectratio = 'Custom';
    }
    let exclude = getUserSetting('reuseparamexcludelist').split(',').map(s => cleanParamName(s));
    let resetExclude = [...exclude, ...Object.keys(metadata), ...Object.keys(extra).map(e => e.endsWith('_filename') ? e.substring(0, e.length - '_filename'.length) : null).filter(e => e != null)];
    resetParamsToDefault(resetExclude, false);
    for (let param of gen_param_types) {
        if (param.nonreusable || exclude.includes(param.id)) {
            continue;
        }
        let elem = document.getElementById(`input_${param.id}`);
        let val = metadata[param.id];
        if (elem && val !== undefined && val !== null && val !== '') {
            setDirectParamValue(param, val);
            if (param.group && param.group.toggles) {
                let toggle = getRequiredElementById(`input_group_content_${param.group.id}_toggle`);
                if (!toggle.checked) {
                    toggle.click();
                }
            }
        }
        else if (elem && param.toggleable && param.visible && !resetExclude.includes(param.id)) {
            let toggle = getRequiredElementById(`input_${param.id}_toggle`);
            toggle.checked = false;
            doToggleEnable(elem.id);
        }
    }
    hideUnsupportableParams();
}

function shiftToNextImagePreview(next = true, expand = false) {
    let curImgElem = document.getElementById('current_image_img');
    if (!curImgElem) {
        return;
    }
    let expandedState = imageFullView.isOpen() ? imageFullView.copyState() : {};
    if (curImgElem.dataset.batch_id == 'history') {
        let divs = [...lastHistoryImageDiv.parentElement.children].filter(div => div.classList.contains('image-block'));
        let index = divs.findIndex(div => div == lastHistoryImageDiv);
        if (index == -1) {
            console.log(`Image preview shift failed as current image ${lastHistoryImage} is not in history area`);
            return;
        }
        let newIndex = index + (next ? 1 : -1);
        if (newIndex < 0) {
            newIndex = divs.length - 1;
        }
        else if (newIndex >= divs.length) {
            newIndex = 0;
        }
        divs[newIndex].querySelector('img').click();
        if (expand) {
            divs[newIndex].querySelector('img').click();
            imageFullView.showImage(currentImgSrc, currentMetadataVal);
            imageFullView.pasteState(expandedState);
        }
        return;
    }
    let batch_area = getRequiredElementById('current_image_batch');
    let imgs = [...batch_area.getElementsByTagName('img')].filter(i => findParentOfClass(i, 'image-block-placeholder') == null);
    let index = imgs.findIndex(img => img.src == curImgElem.src);
    if (index == -1) {
        let cleanSrc = (img) => img.src.length > 100 ? img.src.substring(0, 100) + '...' : img.src;
        console.log(`Image preview shift failed as current image ${cleanSrc(curImgElem)} is not in batch area set ${imgs.map(cleanSrc)}`);
        return;
    }
    let newIndex = index + (next ? 1 : -1);
    if (newIndex < 0) {
        newIndex = imgs.length - 1;
    }
    else if (newIndex >= imgs.length) {
        newIndex = 0;
    }
    let newImg = imgs[newIndex];
    let block = findParentOfClass(newImg, 'image-block');
    setCurrentImage(block.dataset.src, block.dataset.metadata, block.dataset.batch_id, newImg.dataset.previewGrow == 'true');
    if (expand) {
        imageFullView.showImage(block.dataset.src, block.dataset.metadata);
        imageFullView.pasteState(expandedState);
    }
}

window.addEventListener('keydown', function(kbevent) {
    let isFullView = imageFullView.isOpen();
    let isCurImgFocused = document.activeElement && 
        (findParentOfClass(document.activeElement, 'current_image')
        || findParentOfClass(document.activeElement, 'current_image_batch')
        || document.activeElement.tagName == 'BODY');
    if (isFullView && kbevent.key == 'Escape') {
        $('#image_fullview_modal').modal('toggle');
    }
    else if ((kbevent.key == 'ArrowLeft' || kbevent.key == 'ArrowUp') && (isFullView || isCurImgFocused)) {
        shiftToNextImagePreview(false, isFullView);
    }
    else if ((kbevent.key == 'ArrowRight' || kbevent.key == 'ArrowDown') && (isFullView || isCurImgFocused)) {
        shiftToNextImagePreview(true, isFullView);
    }
    else if (kbevent.key === "Enter" && kbevent.ctrlKey && isVisible(getRequiredElementById('main_image_area'))) {
        getRequiredElementById('alt_generate_button').click();
    }
    else if (kbevent.key === "Enter" && kbevent.ctrlKey && isVisible(getRequiredElementById('simple_generate_button'))) {
        getRequiredElementById('simple_generate_button').click();
    }
    else {
        return;
    }
    kbevent.preventDefault();
    kbevent.stopPropagation();
    return false;
});

function alignImageDataFormat() {
    let curImg = getRequiredElementById('current_image');
    let img = document.getElementById('current_image_img');
    if (!img) {
        return;
    }
    let format = getUserSetting('ImageMetadataFormat', 'auto');
    let extrasWrapper = curImg.querySelector('.current-image-extras-wrapper');
    let scale = img.dataset.previewGrow == 'true' ? 8 : 1;
    let imgWidth = img.naturalWidth * scale;
    let imgHeight = img.naturalHeight * scale;
    let ratio = imgWidth / imgHeight;
    let height = Math.min(imgHeight, curImg.offsetHeight);
    let width = Math.min(imgWidth, height * ratio);
    let remainingWidth = curImg.clientWidth - width - 30;
    img.style.maxWidth = `calc(min(100%, ${width}px))`;
    if ((remainingWidth > 30 * 16 && format == 'auto') || format == 'side') {
        curImg.classList.remove('current_image_small');
        extrasWrapper.style.display = 'inline-block';
        extrasWrapper.classList.add('extras-wrapper-sideblock');
        img.style.maxHeight = `calc(max(15rem, 100%))`;
        if (remainingWidth < 30 * 16) {
            extrasWrapper.style.width = `${30 * 16}px`;
            extrasWrapper.style.maxWidth = `${30 * 16}px`;
            img.style.maxWidth = `calc(min(100%, ${curImg.clientWidth - 30 * 16 - 30}px))`;
        }
        else {
            extrasWrapper.style.width = `${remainingWidth}px`;
            extrasWrapper.style.maxWidth = `${remainingWidth}px`;
        }
    }
    else {
        curImg.classList.add('current_image_small');
        extrasWrapper.style.width = '100%';
        extrasWrapper.style.maxWidth = `100%`;
        extrasWrapper.style.display = 'block';
        extrasWrapper.classList.remove('extras-wrapper-sideblock');
        img.style.maxHeight = `calc(max(15rem, 100% - 5.1rem))`;
    }
}

function toggleStar(path, rawSrc) {
    genericRequest('ToggleImageStarred', {'path': path}, data => {
        let curImgImg = document.getElementById('current_image_img');
        if (curImgImg && curImgImg.dataset.src == rawSrc) {
            let oldMetadata = JSON.parse(curImgImg.dataset.metadata);
            let newMetadata = { ...oldMetadata, is_starred: data.new_state };
            curImgImg.dataset.metadata = JSON.stringify(newMetadata);
            let button = getRequiredElementById('current_image').querySelector('.star-button');
            if (data.new_state) {
                button.classList.add('button-starred-image');
                button.innerText = 'Starred';
            }
            else {
                button.classList.remove('button-starred-image');
                button.innerText = 'Star';
            }
        }
        let batchDiv = getRequiredElementById('current_image_batch').querySelector(`.image-block[data-src="${rawSrc}"]`);
        if (batchDiv) {
            batchDiv.dataset.metadata = JSON.stringify({ ...(JSON.parse(batchDiv.dataset.metadata ?? '{}') ?? {}), is_starred: data.new_state });
            batchDiv.classList.toggle('image-block-starred', data.new_state);
        }
        let historyDiv = getRequiredElementById('imagehistorybrowser-content').querySelector(`.image-block[data-src="${rawSrc}"]`);
        if (historyDiv) {
            historyDiv.dataset.metadata = JSON.stringify({ ...(JSON.parse(historyDiv.dataset.metadata ?? '{}') ?? {}), is_starred: data.new_state });
            historyDiv.classList.toggle('image-block-starred', data.new_state);
        }
        if (imageFullView.isOpen() && imageFullView.currentSrc == rawSrc) {
            let oldMetadata = JSON.parse(imageFullView.currentMetadata);
            let newMetadata = { ...oldMetadata, is_starred: data.new_state };
            imageFullView.showImage(rawSrc, JSON.stringify(newMetadata));
        }
    });
}

defaultButtonChoices = 'Use As Init,Edit Image,Star,Reuse Parameters';

function getImageFullSrc(src) {
    let fullSrc = src;
    if (fullSrc.startsWith("http://") || fullSrc.startsWith("https://")) {
        fullSrc = fullSrc.substring(fullSrc.indexOf('/', fullSrc.indexOf('/') + 2));
    }
    if (fullSrc.startsWith('/')) {
        fullSrc = fullSrc.substring(1);
    }
    if (fullSrc.startsWith('Output/')) {
        fullSrc = fullSrc.substring('Output/'.length);
    }
    if (fullSrc.startsWith('View/')) {
        fullSrc = fullSrc.substring('View/'.length);
        let firstSlash = fullSrc.indexOf('/');
        if (firstSlash != -1) {
            fullSrc = fullSrc.substring(firstSlash + 1);
        }
    }
    return fullSrc;
}

function setCurrentImage(src, metadata = '', batchId = '', previewGrow = false, smoothAdd = false, canReparse = true, isPlaceholder = false) {
    currentImgSrc = src;
    if (metadata) {
        metadata = interpretMetadata(metadata);
    }
    currentMetadataVal = metadata;
    let isVideo = isVideoExt(src);
    if ((smoothAdd || !metadata) && canReparse && !isVideo) {
        let image = new Image();
        image.onload = () => {
            if (!metadata) {
                parseMetadata(image, (data, parsedMetadata) => {
                    setCurrentImage(src, parsedMetadata, batchId, previewGrow, false, false);
                });
            }
            else {
                setCurrentImage(src, metadata, batchId, previewGrow, false, false);
            }
        };
        image.src = src;
        return;
    }
    let curImg = getRequiredElementById('current_image');
    if (isPlaceholder) {
        curImg.classList.add('current_image_placeholder');
    }
    else {
        curImg.classList.remove('current_image_placeholder');
    }
    let img;
    let isReuse = false;
    let srcTarget;
    if (isVideo) {
        curImg.innerHTML = '';
        img = document.createElement('video');
        img.loop = true;
        img.autoplay = true;
        img.muted = true;
        let sourceObj = document.createElement('source');
        srcTarget = sourceObj;
        sourceObj.type = `video/${src.substring(src.lastIndexOf('.') + 1)}`;
        img.appendChild(sourceObj);
    }
    else {
        img = document.getElementById('current_image_img');
        if (!img || img.tagName != 'IMG') {
            curImg.innerHTML = '';
            img = document.createElement('img');
        }
        else {
            isReuse = true;
            delete img.dataset.previewGrow;
            img.removeAttribute('width');
            img.removeAttribute('height');
        }
        srcTarget = img;
    }
    function naturalDim() {
        if (isVideo) {
            return [img.videoWidth, img.videoHeight];
        }
        else {
            return [img.naturalWidth, img.naturalHeight];
        }
    }
    img.onload = () => {
        let [width, height] = naturalDim();
        if (previewGrow || getUserSetting('centerimagealwaysgrow')) {
            img.width = width * 8;
            img.height = height * 8;
            img.dataset.previewGrow = 'true';
        }
        alignImageDataFormat();
    }
    srcTarget.src = src;
    img.className = 'current-image-img';
    img.id = 'current_image_img';
    img.dataset.src = src;
    img.dataset.metadata = metadata || '{}';
    img.dataset.batch_id = batchId;
    img.onclick = () => imageFullView.showImage(img.dataset.src, img.dataset.metadata);
    let extrasWrapper = isReuse ? document.getElementById('current-image-extras-wrapper') : createDiv('current-image-extras-wrapper', 'current-image-extras-wrapper');
    extrasWrapper.innerHTML = '';
    let buttons = createDiv(null, 'current-image-buttons');
    let imagePathClean = getImageFullSrc(src);
    let buttonsChoice = getUserSetting('ButtonsUnderMainImages', '');
    if (buttonsChoice == '')
    {
        buttonsChoice = defaultButtonChoices;
    }
    buttonsChoice = buttonsChoice.toLowerCase().replaceAll(' ', '').split(',');
    let subButtons = [];
    function includeButton(name, action, extraClass = '', title = '') {
        let checkName = name.toLowerCase().replaceAll(' ', '');
        if (checkName == 'starred') {
            checkName = 'star';
        }
        if (buttonsChoice.includes(checkName)) {
            quickAppendButton(buttons, name, (e, button) => action(button), extraClass, title);
        }
        else {
            subButtons.push({ key: name, action: action, title: title });
        }
    }
    let isDataImage = src.startsWith('data:');
    includeButton('Use As Init', () => {
        let initImageParam = document.getElementById('input_initimage');
        if (initImageParam) {
            let type = img.src.substring(img.src.lastIndexOf('.') + 1);
            let set = (blob) => {
                let file = new File([blob], imagePathClean, { type: `image/${type.length > 0 && type.length < 20 ? type : 'png'}` });
                let container = new DataTransfer();
                container.items.add(file);
                initImageParam.files = container.files;
                triggerChangeFor(initImageParam);
                toggleGroupOpen(initImageParam, true);
                let toggler = getRequiredElementById('input_group_content_initimage_toggle');
                toggler.checked = true;
                triggerChangeFor(toggler);
            };
            if (img.dataset.src && (img.dataset.src.startsWith('data:') || img.dataset.src.startsWith('/') || img.dataset.src.startsWith('View/'))) {
                fetch(img.dataset.src).then(response => response.blob()).then(blob => {
                    set(blob);
                });
            }
            else {
                let tmpImg = new Image();
                tmpImg.crossOrigin = 'Anonymous';
                tmpImg.onload = () => {
                    let canvas = document.createElement('canvas');
                    canvas.width = tmpImg.naturalWidth;
                    canvas.height = tmpImg.naturalHeight;
                    let ctx = canvas.getContext('2d');
                    ctx.drawImage(tmpImg, 0, 0);
                    canvas.toBlob(blob => {
                        set(blob);
                    });
                };
                tmpImg.src = img.src;
            }
        }
    }, '', 'Sets this image as the Init Image parameter input');
    includeButton('Use As Image Prompt', () => {
        let altPromptRegion = document.getElementById('alt_prompt_region');
        if (!altPromptRegion) {
            return;
        }
        let tmpImg = new Image();
        tmpImg.crossOrigin = 'Anonymous';
        tmpImg.onload = () => {
            let canvas = document.createElement('canvas');
            canvas.width = tmpImg.naturalWidth;
            canvas.height = tmpImg.naturalHeight;
            let ctx = canvas.getContext('2d');
            ctx.drawImage(tmpImg, 0, 0);
            canvas.toBlob(blob => {
                let type = img.src.substring(img.src.lastIndexOf('.') + 1);
                let file = new File([blob], imagePathClean, { type: `image/${type.length > 0 && type.length < 20 ? type : 'png'}` });
                imagePromptAddImage(file);
            });
        };
        tmpImg.src = img.src;
    }, '', 'Uses this image as an Image Prompt input');
    includeButton('Edit Image', () => {
        let initImageGroupToggle = document.getElementById('input_group_content_initimage_toggle');
        if (initImageGroupToggle) {
            initImageGroupToggle.checked = true;
            triggerChangeFor(initImageGroupToggle);
        }
        let initImageParam = document.getElementById('input_initimage');
        if (!initImageParam) {
            showError('Cannot use "Edit Image": Init Image parameter not found\nIf you have a custom workflow, deactivate it, or add an Init Image parameter.');
            return;
        }
        let inputWidth = document.getElementById('input_width');
        let inputHeight = document.getElementById('input_height');
        let inputAspectRatio = document.getElementById('input_aspectratio');
        if (inputWidth && inputHeight) {
            inputWidth.value = img.naturalWidth;
            inputHeight.value = img.naturalHeight;
            triggerChangeFor(inputWidth);
            triggerChangeFor(inputHeight);
        }
        if (inputAspectRatio) {
            inputAspectRatio.value = 'Custom';
            triggerChangeFor(inputAspectRatio);
        }
        imageEditor.setBaseImage(img);
        imageEditor.activate();
    }, '', 'Opens an Image Editor for this image');
    includeButton('Upscale 2x', () => {
        toDataURL(img.src, (url => {
            let [width, height] = naturalDim();
            let input_overrides = {
                'initimage': url,
                'images': 1,
                'aspectratio': 'Custom',
                'width': width * 2,
                'height': height * 2
            };
            mainGenHandler.doGenerate(input_overrides, { 'initimagecreativity': 0.4 });
        }));
    }, '', 'Runs an instant generation with this image as the input and scale doubled');
    includeButton('Refine Image', () => {
        toDataURL(img.src, (url => {
            let input_overrides = {
                'initimage': url,
                'initimagecreativity': 0,
                'images': 1
            };
            if (currentMetadataVal) {
                let readable = interpretMetadata(currentMetadataVal);
                let metadata = readable ? JSON.parse(readable).sui_image_params : {};
                if ('seed' in metadata) {
                    input_overrides['seed'] = metadata.seed;
                }
            }
            let togglerInit = getRequiredElementById('input_group_content_initimage_toggle');
            let togglerRefine = getRequiredElementById('input_group_content_refineupscale_toggle');
            let togglerInitOriginal = togglerInit.checked;
            let togglerRefineOriginal = togglerRefine.checked;
            togglerInit.checked = false;
            togglerRefine.checked = true;
            triggerChangeFor(togglerInit);
            triggerChangeFor(togglerRefine);
            mainGenHandler.doGenerate(input_overrides, {}, () => {
                togglerInit.checked = togglerInitOriginal;
                togglerRefine.checked = togglerRefineOriginal;
                triggerChangeFor(togglerInit);
                triggerChangeFor(togglerRefine);
            });
        }));
    }, '', 'Runs an instant generation with Refine / Upscale turned on');
    let metaParsed = { is_starred: false };
    if (metadata) {
        try {
            metaParsed = JSON.parse(metadata) || metaParsed;
        }
        catch (e) {
            console.log(`Error parsing metadata for image: '${e}', metadata was '${metadata}'`);
        }
    }
    if (!isDataImage) {
        includeButton(metaParsed.is_starred ? 'Starred' : 'Star', (e, button) => {
            toggleStar(imagePathClean, src);
        }, (metaParsed.is_starred ? ' star-button button-starred-image' : ' star-button'), 'Toggles this image as starred - starred images get moved to a separate folder and highlighted');
    }
    includeButton('Reuse Parameters', copy_current_image_params, '', 'Copies the parameters used to generate this image to the current generation settings');
    if (!isDataImage) {
        includeButton('View In History', () => {
            let folder = imagePathClean;
            let lastSlash = folder.lastIndexOf('/');
            if (lastSlash != -1) {
                folder = folder.substring(0, lastSlash);
            }
            getRequiredElementById('imagehistorytabclickable').click();
            imageHistoryBrowser.navigate(folder);
        }, '', 'Jumps the Image History browser to where this image is at.');
    }
    for (let added of buttonsForImage(imagePathClean, src, metadata)) {
        if (added.label == 'Star' || added.label == 'Unstar') {
            continue;
        }
        if (added.href) {
            subButtons.push({ key: added.label, href: added.href, is_download: added.is_download, title: added.title });
        }
        else {
            includeButton(added.label, added.onclick, '', added.title);
        }
    }
    quickAppendButton(buttons, 'More &#x2B9F;', (e, button) => {
        let rect = button.getBoundingClientRect();
        new AdvancedPopover('image_more_popover', subButtons, false, rect.x, rect.y + button.offsetHeight + 6, document.body, null);
    });
    extrasWrapper.appendChild(buttons);
    let data = createDiv(null, 'current-image-data');
    data.innerHTML = formatMetadata(metadata);
    extrasWrapper.appendChild(data);
    if (!isReuse) {
        curImg.appendChild(img);
        curImg.appendChild(extrasWrapper);
    }
}

/** Gets the container div element for a generated image to put into, in the batch output view. If Separate Batches is enabled, will use or create a per-batch container. */
function getPreferredBatchContainer(batchId) {
    let mainContainer = getRequiredElementById('current_image_batch');
    if (separateBatchesElem.checked) {
        let reqId = batchId.split('_')[0];
        let batchContainer = document.getElementById(`current_image_batch_${reqId}`);
        if (!batchContainer) {
            batchContainer = createDiv(`current_image_batch_${reqId}`, null);
            mainContainer.prepend(batchContainer);
        }
        return batchContainer;
    }
    return mainContainer;
}

function appendImage(container, imageSrc, batchId, textPreview, metadata = '', type = 'legacy', prepend = true) {
    if (typeof container == 'string') {
        container = getRequiredElementById(container);
    }
    container.dataset.numImages = (container.dataset.numImages ?? 0) + 1;
    let div = createDiv(null, `image-block image-block-${type} image-batch-${batchId == "folder" ? "folder" : (container.dataset.numImages % 2 ? "1" : "0")}`);
    div.dataset.batch_id = batchId;
    div.dataset.preview_text = textPreview;
    if (imageSrc.startsWith('DOPLACEHOLDER:')) {
        let model = imageSrc.substring('DOPLACEHOLDER:'.length);
        let cache = modelIconUrlCache[model] || modelIconUrlCache[`${model}.safetensors`];
        if (model && cache) {
            imageSrc = cache;
        }
        else {
            imageSrc = 'imgs/model_placeholder.jpg';
        }
        div.dataset.is_placeholder = true;
        div.classList.add('image-block-placeholder');
    }
    div.dataset.src = imageSrc;
    div.dataset.metadata = metadata;
    let isVideo = isVideoExt(imageSrc);
    let img, srcTarget;
    if (isVideo) {
        img = document.createElement('video');
        img.loop = true;
        img.autoplay = true;
        img.muted = true;
        img.width = 16 * 10;
        let sourceObj = document.createElement('source');
        srcTarget = sourceObj;
        sourceObj.type = `video/${src.substring(src.lastIndexOf('.') + 1)}`;
        img.appendChild(sourceObj);
    }
    else {
        img = document.createElement('img');
        srcTarget = img;
    }
    img.addEventListener('load', () => {
        if (batchId != "folder") {
            let ratio = img.naturalWidth / img.naturalHeight;
            div.style.width = `calc(${roundToStr(ratio * 10, 2)}rem + 2px)`;
        }
    });
    srcTarget.src = imageSrc;
    div.appendChild(img);
    if (type == 'legacy') {
        let textBlock = createDiv(null, 'image-preview-text');
        textBlock.innerText = textPreview;
        div.appendChild(textBlock);
    }
    if (prepend) {
        container.prepend(div);
    }
    else {
        container.appendChild(div);
    }
    return div;
}

function gotImageResult(image, metadata, batchId) {
    updateGenCount();
    let src = image;
    let fname = src && src.includes('/') ? src.substring(src.lastIndexOf('/') + 1) : src;
    let batch_div = appendImage(getPreferredBatchContainer(batchId), src, batchId, fname, metadata, 'batch');
    batch_div.addEventListener('click', () => clickImageInBatch(batch_div));
    batch_div.addEventListener('contextmenu', (e) => rightClickImageInBatch(e, batch_div));
    if (!document.getElementById('current_image_img') || autoLoadImagesElem.checked) {
        setCurrentImage(src, metadata, batchId, false, true);
        if (getUserSetting('AutoSwapImagesIncludesFullView') && imageFullView.isOpen()) {
            imageFullView.showImage(src, metadata);
        }
    }
    return batch_div;
}

function gotImagePreview(image, metadata, batchId) {
    updateGenCount();
    let src = image;
    let fname = src && src.includes('/') ? src.substring(src.lastIndexOf('/') + 1) : src;
    let batch_div = appendImage(getPreferredBatchContainer(batchId), src, batchId, fname, metadata, 'batch', true);
    batch_div.querySelector('img').dataset.previewGrow = 'true';
    batch_div.addEventListener('click', () => clickImageInBatch(batch_div));
    batch_div.addEventListener('contextmenu', (e) => rightClickImageInBatch(e, batch_div));
    if (showLoadSpinnersElem.checked) {
        let spinnerDiv = createDiv(null, "loading-spinner-parent", `<div class="loading-spinner"><div class="loadspin1"></div><div class="loadspin2"></div><div class="loadspin3"></div></div>`);
        batch_div.appendChild(spinnerDiv);
        uiImprover.runLoadSpinner(spinnerDiv);
    }
    if ((!document.getElementById('current_image_img') || autoLoadPreviewsElem.checked) && !image.startsWith('DOPLACEHOLDER:')) {
        setCurrentImage(src, metadata, batchId, true);
    }
    return batch_div;
}

function imageInputHandler() {
    let imageArea = getRequiredElementById('current_image');
    imageArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    imageArea.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            let file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                let reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        parseMetadata(e.target.result, (data, metadata) => { setCurrentImage(data, metadata); });
                    }
                    catch (e) {
                        setCurrentImage(e.target.result, null);
                    }
                }
                reader.readAsDataURL(file);
            }
        }
    });
}
imageInputHandler();
