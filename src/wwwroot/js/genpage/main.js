let gen_param_types = null, rawGenParamTypesFromServer = null;

let lastImageDir = '';

let lastModelDir = '';

let num_current_gens = 0, num_models_loading = 0, num_live_gens = 0, num_backends_waiting = 0;

let shouldApplyDefault = false;

let sessionReadyCallbacks = [];

let allModels = [];

let coreModelMap = {};

let otherInfoSpanContent = [];

let isGeneratingForever = false, isGeneratingPreviews = false;

let lastHistoryImage = null, lastHistoryImageDiv = null;

let currentMetadataVal = null, currentImgSrc = null;

let autoCompletionsList = null;
let autoCompletionsOptimize = false;

let mainGenHandler = new GenerateHandler();

function updateOtherInfoSpan() {
    let span = getRequiredElementById('other_info_span');
    span.innerHTML = otherInfoSpanContent.join(' ');
}

const time_started = Date.now();

let statusBarElem = getRequiredElementById('top_status_bar');

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
    let popover = new AdvancedPopover('image_batch_context_menu', [ { key: 'Remove', action: () => div.remove() } ], false, mouseX, mouseY, document.body, null);
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
    resetParamsToDefault(exclude);
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
        else if (elem && param.toggleable && param.visible) {
            let toggle = getRequiredElementById(`input_${param.id}_toggle`);
            toggle.checked = false;
            doToggleEnable(elem.id);
        }
    }
    hideUnsupportableParams();
}

let metadataKeyFormatCleaners = [];

function formatMetadata(metadata) {
    if (!metadata) {
        return '';
    }
    let data;
    try {
        let readable = interpretMetadata(metadata);
        if (!readable) {
            return '';
        }
        data = JSON.parse(readable);
    }
    catch (e) {
        console.log(`Error parsing metadata '${metadata}': ${e}`);
        return `Broken metadata: ${escapeHtml(metadata)}`;
    }
    let result = '';
    function appendObject(obj) {
        if (obj) {
            for (let key of Object.keys(obj)) {
                let val = obj[key];
                if (val !== null && val !== '') { // According to javascript, 0 == '', so have to === to block that. Argh.
                    for (let cleaner of metadataKeyFormatCleaners) {
                        key = cleaner(key);
                    }
                    let hash = Math.abs(hashCode(key.toLowerCase().replaceAll(' ', '').replaceAll('_', ''))) % 10;
                    let title = '';
                    let keyTitle = '';
                    let added = '';
                    if (key.includes('model') || key.includes('lora') || key.includes('embedding')) {
                        added += ' param_view_block_model';
                    }
                    let param = getParamById(key);
                    if (param) {
                        key = param.name;
                        keyTitle = param.description;
                        if (param.values && param.value_names && param.values.length == param.value_names.length) {
                            let index = param.values.indexOf(val);
                            if (index != -1) {
                                title = val;
                                val = param.value_names[index];
                            }
                        }
                    }
                    if (typeof val == 'object') {
                        result += `<span class="param_view_block tag-text tag-type-${hash}${added}"><span class="param_view_name">${escapeHtml(key)}</span>: `;
                        appendObject(val);
                        result += `</span>, `;
                    }
                    else {
                        result += `<span class="param_view_block tag-text tag-type-${hash}${added}"><span class="param_view_name" title="${escapeHtml(keyTitle)}">${escapeHtml(key)}</span>: <span class="param_view tag-text-soft tag-type-${hash}" title="${escapeHtml(title)}">${escapeHtml(`${val}`)}</span></span>, `;
                    }
                }
            }
        }
    };
    if ('swarm_version' in data.sui_image_params && 'sui_extra_data' in data) {
        data.sui_extra_data['Swarm Version'] = data.sui_image_params.swarm_version;
        delete data.sui_image_params.swarm_version;
    }
    if ('prompt' in data.sui_image_params && data.sui_image_params.prompt) {
        appendObject({ 'prompt': data.sui_image_params.prompt });
        result += '\n<br>';
        delete data.sui_image_params.prompt;
    }
    if ('negativeprompt' in data.sui_image_params && data.sui_image_params.negativeprompt) {
        appendObject({ 'negativeprompt': data.sui_image_params.negativeprompt });
        result += '\n<br>';
        delete data.sui_image_params.negativeprompt;
    }
    appendObject(data.sui_image_params);
    result += '\n<br>';
    if ('sui_extra_data' in data) {
        appendObject(data.sui_extra_data);
    }
    return result;
}

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
            if (!this.noClose && this.modal.style.display == 'block' && !findParentOfClass(e.target, 'imageview_popup_modal_undertext')) {
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
        newLeft = Math.min(overWidth, Math.max(newLeft, img.parentElement.offsetWidth - img.width - overWidth));
        newTop = Math.min(overHeight, Math.max(newTop, img.parentElement.offsetHeight - img.height - overHeight));
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
            let imgAspectRatio = img.naturalWidth / img.naturalHeight;
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
        let maxHeight = Math.sqrt(img.naturalWidth * img.naturalHeight) * 2;
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
        let isVideo = isVideoExt(src);
        let imgHtml = `<img class="imageview_popup_modal_img" id="imageview_popup_modal_img" style="cursor:grab;max-width:100%;object-fit:contain;" src="${src}">`;
        if (isVideo) {
            imgHtml = `<video class="imageview_popup_modal_img" id="imageview_popup_modal_img" style="cursor:grab;max-width:100%;object-fit:contain;" autoplay loop muted><source src="${src}" type="video/${src.substring(src.lastIndexOf('.') + 1)}"></video>`;
        }
        this.content.innerHTML = `
        <div class="modal-dialog" style="display:none">(click outside image to close)</div>
        <div class="imageview_modal_inner_div">
            <div class="imageview_modal_imagewrap" id="imageview_modal_imagewrap" style="text-align:center;">
                ${imgHtml}
            </div>
            <div class="imageview_popup_modal_undertext">
            ${formatMetadata(metadata)}
            </div>
        </div>`;
        this.modalJq.modal('show');
    }

    close() {
        this.isDragging = false;
        this.didDrag = false;
        this.modalJq.modal('hide');
    }

    isOpen() {
        return this.modalJq.is(':visible');
    }
}

let imageFullView = new ImageFullViewHelper();

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
    let extrasWrapper = curImg.querySelector('.current-image-extras-wrapper');
    let scale = img.dataset.previewGrow == 'true' ? 8 : 1;
    let imgWidth = img.naturalWidth * scale;
    let imgHeight = img.naturalHeight * scale;
    let ratio = imgWidth / imgHeight;
    let height = Math.min(imgHeight, curImg.offsetHeight);
    let width = Math.min(imgWidth, height * ratio);
    let remainingWidth = curImg.clientWidth - width - 30;
    img.style.maxWidth = `calc(min(100%, ${width}px))`;
    if (remainingWidth > 30 * 16) {
        curImg.classList.remove('current_image_small');
        extrasWrapper.style.width = `${remainingWidth}px`;
        extrasWrapper.style.maxWidth = `${remainingWidth}px`;
        extrasWrapper.style.display = 'inline-block';
        img.style.maxHeight = `calc(max(15rem, 100%))`;
    }
    else {
        curImg.classList.add('current_image_small');
        extrasWrapper.style.width = '100%';
        extrasWrapper.style.maxWidth = `100%`;
        extrasWrapper.style.display = 'block';
        img.style.maxHeight = `calc(max(15rem, 100% - 5.1rem))`;
    }
}

function toggleStar(path, rawSrc) {
    genericRequest('ToggleImageStarred', {'path': path}, data => {
        let curImgImg = document.getElementById('current_image_img');
        if (curImgImg && curImgImg.dataset.src == rawSrc) {
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
    });
}

defaultButtonChoices = 'Use As Init,Edit Image,Star,Reuse Parameters';

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
    img.dataset.batch_id = batchId;
    img.onclick = () => imageFullView.showImage(src, metadata);
    let extrasWrapper = isReuse ? document.getElementById('current-image-extras-wrapper') : createDiv('current-image-extras-wrapper', 'current-image-extras-wrapper');
    extrasWrapper.innerHTML = '';
    let buttons = createDiv(null, 'current-image-buttons');
    let imagePathClean = src;
    if (imagePathClean.startsWith("http://") || imagePathClean.startsWith("https://")) {
        imagePathClean = imagePathClean.substring(imagePathClean.indexOf('/', imagePathClean.indexOf('/') + 2));
    }
    if (imagePathClean.startsWith('/')) {
        imagePathClean = imagePathClean.substring(1);
    }
    if (imagePathClean.startsWith('Output/')) {
        imagePathClean = imagePathClean.substring('Output/'.length);
    }
    if (imagePathClean.startsWith('View/')) {
        imagePathClean = imagePathClean.substring('View/'.length);
        let firstSlash = imagePathClean.indexOf('/');
        if (firstSlash != -1) {
            imagePathClean = imagePathClean.substring(firstSlash + 1);
        }
    }
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
            mainGenHandler.doGenerate(input_overrides);
            togglerInit.checked = togglerInitOriginal;
            togglerRefine.checked = togglerRefineOriginal;
            triggerChangeFor(togglerInit);
            triggerChangeFor(togglerRefine);
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
        if (added.label == 'Star') {
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
    let batch_div = appendImage('current_image_batch', src, batchId, fname, metadata, 'batch');
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
    let batch_div = appendImage('current_image_batch', src, batchId, fname, metadata, 'batch', true);
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

let originalPageTitle = document.title;

let generatingPreviewsText = translatable('Generating live previews...');
let waitingOnModelLoadText = translatable('waiting on model load');
let generatingText = translatable('generating');

function updateCurrentStatusDirect(data) {
    if (data) {
        num_current_gens = data.waiting_gens;
        num_models_loading = data.loading_models;
        num_live_gens = data.live_gens;
        num_backends_waiting = data.waiting_backends;
    }
    let total = num_current_gens + num_models_loading + num_live_gens + num_backends_waiting;
    if (isGeneratingPreviews && num_current_gens <= getRequiredElementById('usersettings_maxsimulpreviews').value) {
        total = 0;
    }
    getRequiredElementById('alt_interrupt_button').classList.toggle('interrupt-button-none', total == 0);
    let oldInterruptButton = document.getElementById('interrupt_button');
    if (oldInterruptButton) {
        oldInterruptButton.classList.toggle('interrupt-button-none', total == 0);
    }
    let elem = getRequiredElementById('num_jobs_span');
    function autoBlock(num, text) {
        if (num == 0) {
            return '';
        }
        return `<span class="interrupt-line-part">${num} ${text.replaceAll('%', autoS(num))},</span> `;
    }
    let timeEstimate = '';
    if (total > 0 && mainGenHandler.totalGensThisRun > 0) {
        let avgGenTime = mainGenHandler.totalGenRunTime / mainGenHandler.totalGensThisRun;
        let estTime = avgGenTime * total;
        timeEstimate = ` (est. ${durationStringify(estTime)})`;
    }
    elem.innerHTML = total == 0 ? (isGeneratingPreviews ? translatableText.get() : '') : `${autoBlock(num_current_gens, 'current generation%')}${autoBlock(num_live_gens, 'running')}${autoBlock(num_backends_waiting, 'queued')}${autoBlock(num_models_loading, waitingOnModelLoadText.get())} ${timeEstimate}...`;
    let max = Math.max(num_current_gens, num_models_loading, num_live_gens, num_backends_waiting);
    document.title = total == 0 ? originalPageTitle : `(${max} ${generatingText.get()}) ${originalPageTitle}`;
}

let doesHaveGenCountUpdateQueued = false;

function updateGenCount() {
    updateCurrentStatusDirect(null);
    if (doesHaveGenCountUpdateQueued) {
        return;
    }
    doesHaveGenCountUpdateQueued = true;
    setTimeout(() => {
        reviseStatusBar();
    }, 500);
}

function makeWSRequestT2I(url, in_data, callback, errorHandle = null) {
    return makeWSRequest(url, in_data, data => {
        if (data.status) {
            updateCurrentStatusDirect(data.status);
        }
        else {
            callback(data);
        }
    }, 0, errorHandle);
}

function doInterrupt(allSessions = false) {
    genericRequest('InterruptAll', {'other_sessions': allSessions}, data => {
        updateGenCount();
    });
    if (isGeneratingForever) {
        toggleGenerateForever();
    }
}
let genForeverInterval, genPreviewsInterval;

let lastGenForeverParams = null;

function doGenForeverOnce(minQueueSize) {
    if (num_current_gens >= minQueueSize) {
        return;
    }
    let allParams = getGenInput();
    if (allParams['seed'] != -1 && allParams['variationseed'] != -1) {
        if (lastGenForeverParams && JSON.stringify(lastGenForeverParams) == JSON.stringify(allParams)) {
            return;
        }
        lastGenForeverParams = allParams;
    }
    mainGenHandler.doGenerate();
}

function toggleGenerateForever() {
    let button = getRequiredElementById('generate_forever_button');
    isGeneratingForever = !isGeneratingForever;
    if (isGeneratingForever) {
        button.innerText = 'Stop Generating';
        let delaySeconds = parseFloat(getUserSetting('generateforeverdelay', '0.1'));
        let minQueueSize = Math.max(1, parseInt(getUserSetting('generateforeverqueuesize', '1')));
        let delayMs = Math.max(parseInt(delaySeconds * 1000), 1);
        genForeverInterval = setInterval(() => {
            doGenForeverOnce(minQueueSize);
        }, delayMs);
    }
    else {
        button.innerText = 'Generate Forever';
        clearInterval(genForeverInterval);
    }
}

let lastPreviewParams = null;

function genOnePreview() {
    let allParams = getGenInput();
    if (lastPreviewParams && JSON.stringify(lastPreviewParams) == JSON.stringify(allParams)) {
        return;
    }
    lastPreviewParams = allParams;
    let previewPreset = allPresets.find(p => p.title == 'Preview');
    let input_overrides = {};
    if (previewPreset) {
        for (let key of Object.keys(previewPreset.param_map)) {
            let param = gen_param_types.filter(p => p.id == key)[0];
            if (param) {
                let val = previewPreset.param_map[key];
                let elem = document.getElementById(`input_${param.id}`);
                if (elem) {
                    let rawVal = getInputVal(elem);
                    if (typeof val == "string" && val.includes("{value}")) {
                        val = val.replace("{value}", elem.value);
                    }
                    else if (key == 'loras' && rawVal) {
                        val = rawVal + "," + val;
                    }
                    else if (key == 'loraweights' && rawVal) {
                        val = rawVal + "," + val;
                    }
                    input_overrides[key] = val;
                }
            }
        }
    }
    input_overrides['_preview'] = true;
    input_overrides['donotsave'] = true;
    input_overrides['images'] = 1;
    for (let param of gen_param_types) {
        if (param.do_not_preview) {
            input_overrides[param.id] = null;
        }
    }
    mainGenHandler.doGenerate(input_overrides);
}

function needsNewPreview() {
    if (!isGeneratingPreviews) {
        return;
    }
    let max = getRequiredElementById('usersettings_maxsimulpreviews').value;
    if (num_current_gens < max) {
        genOnePreview();
    }
}

getRequiredElementById('alt_prompt_textbox').addEventListener('input', () => needsNewPreview());

function toggleGeneratePreviews(override_preview_req = false) {
    if (!isGeneratingPreviews) {
        let previewPreset = allPresets.find(p => p.title == 'Preview');
        if (!previewPreset && !override_preview_req) {
            let autoButtonArea = getRequiredElementById('gen_previews_autobutton');
            let lcm = coreModelMap['LoRA'].find(m => m.toLowerCase().includes('sdxl_lcm'));
            if (lcm) {
                autoButtonArea.innerHTML = `<hr>You have a LoRA named "${escapeHtml(lcm)}" available - would you like to autogenerate a Preview preset? <button class="btn btn-primary">Generate Preview Preset</button>`;
                autoButtonArea.querySelector('button').addEventListener('click', () => {
                    let toSend = {
                        'is_edit': false,
                        'title': 'Preview',
                        'description': '(Auto-generated) LCM Preview Preset, used when "Generate Previews" is clicked',
                        'param_map': {
                            'loras': lcm,
                            'loraweights': '1',
                            'steps': 4,
                            'cfgscale': 1,
                            'sampler': 'lcm',
                            'scheduler': 'normal'
                        }
                    };
                    genericRequest('AddNewPreset', toSend, data => {
                        if (Object.keys(data).includes("preset_fail")) {
                            gen_previews_autobutton.innerText = data.preset_fail;
                            return;
                        }
                        loadUserData(() => {
                            $('#gen_previews_missing_preset_modal').modal('hide');
                            toggleGeneratePreviews();
                        });
                    });
                });
            }
            $('#gen_previews_missing_preset_modal').modal('show');
            return;
        }
    }
    let button = getRequiredElementById('generate_previews_button');
    isGeneratingPreviews = !isGeneratingPreviews;
    if (isGeneratingPreviews) {
        let seed = document.getElementById('input_seed');
        if (seed && seed.value == -1) {
            seed.value = 1;
        }
        button.innerText = 'Stop Generating Previews';
        genPreviewsInterval = setInterval(() => {
            if (num_current_gens == 0) {
                genOnePreview();
            }
        }, 100);
    }
    else {
        button.innerText = 'Generate Previews';
        clearInterval(genPreviewsInterval);
    }
}

function listImageHistoryFolderAndFiles(path, isRefresh, callback, depth) {
    let sortBy = localStorage.getItem('image_history_sort_by') ?? 'Name';
    let reverse = localStorage.getItem('image_history_sort_reverse') == 'true';
    let sortElem = document.getElementById('image_history_sort_by');
    let sortReverseElem = document.getElementById('image_history_sort_reverse');
    let fix = null;
    if (sortElem) {
        sortBy = sortElem.value;
        reverse = sortReverseElem.checked;
    }
    else { // first call happens before headers are added built atm
        fix = () => {
            let sortElem = document.getElementById('image_history_sort_by');
            let sortReverseElem = document.getElementById('image_history_sort_reverse');
            sortElem.value = sortBy;
            sortReverseElem.checked = reverse;
            sortElem.addEventListener('change', () => {
                localStorage.setItem('image_history_sort_by', sortElem.value);
                imageHistoryBrowser.update();
            });
            sortReverseElem.addEventListener('change', () => {
                localStorage.setItem('image_history_sort_reverse', sortReverseElem.checked);
                imageHistoryBrowser.update();
            });
        }
    }
    let prefix = path == '' ? '' : (path.endsWith('/') ? path : `${path}/`);
    genericRequest('ListImages', {'path': path, 'depth': depth, 'sortBy': sortBy, 'sortReverse': reverse}, data => {
        let folders = data.folders.sort((a, b) => b.toLowerCase().localeCompare(a.toLowerCase()));
        function isPreSortFile(f) {
            return f.src == 'index.html'; // Grid index files
        }
        let preFiles = data.files.filter(f => isPreSortFile(f));
        let postFiles = data.files.filter(f => !isPreSortFile(f));
        data.files = preFiles.concat(postFiles);
        let mapped = data.files.map(f => {
            let fullSrc = `${prefix}${f.src}`;
            return { 'name': fullSrc, 'data': { 'src': `${getImageOutPrefix()}/${fullSrc}`, 'fullsrc': fullSrc, 'name': f.src, 'metadata': f.metadata } };
        });
        callback(folders, mapped);
        if (fix) {
            fix();
        }
    });
}

function buttonsForImage(fullsrc, src, metadata) {
    let isDataImage = src.startsWith('data:');
    buttons = [];
    if (permissions.hasPermission('user_star_images') && !isDataImage) {
        buttons.push({
            label: 'Star',
            title: 'Star or unstar this image - starred images get moved to a separate folder and highlighted.',
            onclick: (e) => {
                toggleStar(fullsrc, src);
            }
        });
    }
    if (metadata) {
        buttons.push({
            label: 'Copy Raw Metadata',
            title: `Copies the raw form of the image's metadata to your clipboard (usually JSON text).`,
            onclick: (e) => {
                navigator.clipboard.writeText(metadata);
                doNoticePopover('Copied!', 'notice-pop-green');
            }
        });
    }
    if (permissions.hasPermission('local_image_folder') && !isDataImage) {
        buttons.push({
            label: 'Open In Folder',
            title: 'Opens the folder containing this image in your local PC file explorer.',
            onclick: (e) => {
                genericRequest('OpenImageFolder', {'path': fullsrc}, data => {});
            }
        });
    }
    buttons.push({
        label: 'Download',
        title: 'Downloads this image to your PC.',
        href: src,
        is_download: true
    });
    if (permissions.hasPermission('user_delete_image') && !isDataImage) {
        buttons.push({
            label: 'Delete',
            title: 'Deletes this image from the server.',
            onclick: (e) => {
                genericRequest('DeleteImage', {'path': fullsrc}, data => {
                    if (e) {
                        e.remove();
                    }
                    else {
                        let historySection = getRequiredElementById('imagehistorybrowser-content');
                        let div = historySection.querySelector(`.image-block[data-src="${src}"]`);
                        if (div) {
                            div.remove();
                        }
                        div = getRequiredElementById('current_image_batch').querySelector(`.image-block[data-src="${src}"]`);
                        if (div) {
                            div.remove();
                        }
                    }
                    let currentImage = document.getElementById('current_image_img');
                    if (currentImage && currentImage.dataset.src == src) {
                        forceShowWelcomeMessage();
                    }
                });
            }
        });
    }
    return buttons;
}

function describeImage(image) {
    let buttons = buttonsForImage(image.data.fullsrc, image.data.src, image.data.metadata);
    let parsedMeta = { is_starred: false };
    if (image.data.metadata) {
        let metadata = image.data.metadata;
        try {
            metadata = interpretMetadata(image.data.metadata);
            parsedMeta = JSON.parse(metadata) || parsedMeta;
        }
        catch (e) {
            console.log(`Failed to parse image metadata: ${e}, metadata was ${metadata}`);
        }
    }
    let formattedMetadata = formatMetadata(image.data.metadata);
    let description = image.data.name + "\n" + formattedMetadata;
    let name = image.data.name;
    let dragImage = image.data.src.endsWith('.html') ? 'imgs/html.jpg' : `${image.data.src}`;
    let imageSrc = image.data.src.endsWith('.html') ? 'imgs/html.jpg' : `${image.data.src}?preview=true`;
    let searchable = description;
    let detail_list = [escapeHtml(image.data.name), formattedMetadata.replaceAll('<br>', '&emsp;')];
    return { name, description, buttons, 'image': imageSrc, 'dragimage': dragImage, className: parsedMeta.is_starred ? 'image-block-starred' : '', searchable, display: name, detail_list };
}

function selectImageInHistory(image, div) {
    lastHistoryImage = image.data.src;
    lastHistoryImageDiv = div;
    let curImg = document.getElementById('current_image_img');
    if (curImg && curImg.dataset.src == image.data.src) {
        curImg.dataset.batch_id = 'history';
        curImg.click();
        return;
    }
    if (image.data.name.endsWith('.html')) {
        window.open(image.data.src, '_blank');
    }
    else {
        if (!div.dataset.metadata) {
            div.dataset.metadata = image.data.metadata;
            div.dataset.src = image.data.src;
        }
        setCurrentImage(image.data.src, div.dataset.metadata, 'history');
    }
}

let imageHistoryBrowser = new GenPageBrowserClass('image_history', listImageHistoryFolderAndFiles, 'imagehistorybrowser', 'Thumbnails', describeImage, selectImageInHistory,
    `<label for="image_history_sort_by">Sort:</label> <select id="image_history_sort_by"><option>Name</option><option>Date</option></select> <input type="checkbox" id="image_history_sort_reverse"> <label for="image_history_sort_reverse">Reverse</label>`);

let hasAppliedFirstRun = false;
let backendsWereLoadingEver = false;
let reviseStatusInterval = null;
let currentBackendFeatureSet = [];
let rawBackendFeatureSet = [];
let lastStatusRequestPending = 0;
function reviseStatusBar() {
    if (lastStatusRequestPending + 20 * 1000 > Date.now()) {
        return;
    }
    if (session_id == null) {
        statusBarElem.innerText = 'Loading...';
        statusBarElem.className = `top-status-bar status-bar-warn`;
        return;
    }
    lastStatusRequestPending = Date.now();
    genericRequest('GetCurrentStatus', {}, data => {
        lastStatusRequestPending = 0;
        if (JSON.stringify(data.supported_features) != JSON.stringify(currentBackendFeatureSet)) {
            rawBackendFeatureSet = data.supported_features;
            currentBackendFeatureSet = data.supported_features;
            reviseBackendFeatureSet();
            hideUnsupportableParams();
        }
        doesHaveGenCountUpdateQueued = false;
        updateCurrentStatusDirect(data.status);
        let status;
        if (versionIsWrong) {
            status = { 'class': 'error', 'message': 'The server has updated since you opened the page, please refresh.' };
        }
        else {
            status = data.backend_status;
            if (data.backend_status.any_loading) {
                backendsWereLoadingEver = true;
            }
            else {
                if (!hasAppliedFirstRun) {
                    hasAppliedFirstRun = true;
                    refreshParameterValues(backendsWereLoadingEver || window.alwaysRefreshOnLoad);
                }
            }
            if (reviseStatusInterval != null) {
                if (status.class != '') {
                    clearInterval(reviseStatusInterval);
                    reviseStatusInterval = setInterval(reviseStatusBar, 2 * 1000);
                }
                else {
                    clearInterval(reviseStatusInterval);
                    reviseStatusInterval = setInterval(reviseStatusBar, 60 * 1000);
                }
            }
        }
        statusBarElem.innerText = translate(status.message);
        statusBarElem.className = `top-status-bar status-bar-${status.class}`;
    });
}

/** Array of functions called on key events (eg model selection change) to update displayed features.
 * Return format [array addMe, array removeMe]. For example `[[], ['sd3']]` indicates that the 'sd3' feature flag is not currently supported (eg by current model).
 * Can use 'curModelCompatClass', 'curModelArch' to check the current model architecture. Note these values may be null.
 * */
let featureSetChangers = [];

function reviseBackendFeatureSet() {
    currentBackendFeatureSet = Array.from(currentBackendFeatureSet);
    let addMe = [], removeMe = [];
    function doCompatFeature(compatClass, featureFlag) {
        if (curModelCompatClass && curModelCompatClass.startsWith(compatClass)) {
            addMe.push(featureFlag);
        }
        else {
            removeMe.push(featureFlag);
        }
    }
    function doAnyCompatFeature(compatClasses, featureFlag) {
        for (let compatClass of compatClasses) {
            if (curModelCompatClass && curModelCompatClass.startsWith(compatClass)) {
                addMe.push(featureFlag);
                return;
            }
        }
        removeMe.push(featureFlag);
    }
    function doAnyArchFeature(archIds, featureFlag) {
        for (let archId of archIds) {
            if (curModelArch && curModelArch.startsWith(archId)) {
                addMe.push(featureFlag);
                return;
            }
        }
        removeMe.push(featureFlag);
    }
    doCompatFeature('stable-diffusion-v3', 'sd3');
    doCompatFeature('stable-cascade-v1', 'cascade');
    doAnyArchFeature(['Flux.1-dev', 'hunyuan-video'], 'flux-dev');
    doCompatFeature('stable-diffusion-xl-v1', 'sdxl');
    doAnyCompatFeature(['genmo-mochi-1', 'lightricks-ltx-video', 'hunyuan-video', 'nvidia-cosmos-1', `wan-21`], 'text2video');
    for (let changer of featureSetChangers) {
        let [add, remove] = changer();
        addMe.push(...add);
        removeMe.push(...remove);
    }
    let anyChanged = false;
    for (let add of addMe) {
        if (!currentBackendFeatureSet.includes(add)) {
            currentBackendFeatureSet.push(add);
            anyChanged = true;
        }
    }
    for (let remove of removeMe) {
        let index = currentBackendFeatureSet.indexOf(remove);
        if (index != -1) {
            currentBackendFeatureSet.splice(index, 1);
            anyChanged = true;
        }
    }
    if (anyChanged) {
        hideUnsupportableParams();
    }
}

function serverResourceLoop() {
    if (isVisible(getRequiredElementById('Server-Info'))) {
        genericRequest('GetServerResourceInfo', {}, data => {
            let target = getRequiredElementById('resource_usage_area');
            let priorWidth = 0;
            if (target.style.minWidth) {
                priorWidth = parseFloat(target.style.minWidth.replaceAll('px', ''));
            }
            target.style.minWidth = `${Math.max(priorWidth, target.offsetWidth)}px`;
            if (data.gpus) {
                let html = '<table class="simple-table"><tr><th>Resource</th><th>ID</th><th>Temp</th><th>Usage</th><th>Mem Usage</th><th>Used Mem</th><th>Free Mem</th><th>Total Mem</th></tr>';
                html += `<tr><td>CPU</td><td>...</td><td>...</td><td>${Math.round(data.cpu.usage * 100)}% (${data.cpu.cores} cores)</td><td>${Math.round(data.system_ram.used / data.system_ram.total * 100)}%</td><td>${fileSizeStringify(data.system_ram.used)}</td><td>${fileSizeStringify(data.system_ram.free)}</td><td>${fileSizeStringify(data.system_ram.total)}</td></tr>`;
                for (let gpu of Object.values(data.gpus)) {
                    html += `<tr><td>${gpu.name}</td><td>${gpu.id}</td><td>${gpu.temperature}&deg;C</td><td>${gpu.utilization_gpu}% Core, ${gpu.utilization_memory}% Mem</td><td>${Math.round(gpu.used_memory / gpu.total_memory * 100)}%</td><td>${fileSizeStringify(gpu.used_memory)}</td><td>${fileSizeStringify(gpu.free_memory)}</td><td>${fileSizeStringify(gpu.total_memory)}</td></tr>`;
                }
                html += '</table>';
                target.innerHTML = html;
            }
        });
        genericRequest('ListConnectedUsers', {}, data => {
            let target = getRequiredElementById('connected_users_list');
            let priorWidth = 0;
            if (target.style.minWidth) {
                priorWidth = parseFloat(target.style.minWidth.replaceAll('px', ''));
            }
            target.style.minWidth = `${Math.max(priorWidth, target.offsetWidth)}px`;
            let html = '<table class="simple-table"><tr><th>Name</th><th>Last Active</th><th>Active Sessions</th></tr>';
            for (let user of data.users) {
                html += `<tr><td>${user.id}</td><td>${user.last_active}</td><td>${user.active_sessions.map(sess => `${sess.count}x from ${sess.address}`).join(', ')}</td></tr>`;
            }
            html += '</table>';
            target.innerHTML = html;
        });
    }
    if (isVisible(backendsListView)) {
        backendLoopUpdate();
    }
}

let toolSelector = getRequiredElementById('tool_selector');
let toolContainer = getRequiredElementById('tool_container');

function genToolsList() {
    let altGenerateButton = getRequiredElementById('alt_generate_button');
    let oldGenerateButton = document.getElementById('generate_button');
    let altGenerateButtonRawText = altGenerateButton.innerText;
    let altGenerateButtonRawOnClick = altGenerateButton.onclick;
    toolSelector.value = '';
    // TODO: Dynamic-from-server option list generation
    toolSelector.addEventListener('change', () => {
        for (let opened of toolContainer.getElementsByClassName('tool-open')) {
            opened.classList.remove('tool-open');
        }
        altGenerateButton.innerText = altGenerateButtonRawText;
        altGenerateButton.onclick = altGenerateButtonRawOnClick;
        if (oldGenerateButton) {
            oldGenerateButton.innerText = altGenerateButtonRawText;
        }
        let tool = toolSelector.value;
        if (tool == '') {
            return;
        }
        let div = getRequiredElementById(`tool_${tool}`);
        div.classList.add('tool-open');
        let override = toolOverrides[tool];
        if (override) {
            altGenerateButton.innerText = override.text;
            altGenerateButton.onclick = override.run;
            if (oldGenerateButton) {
                oldGenerateButton.innerText = override.text;
            }
        }
        div.dispatchEvent(new Event('tool-opened'));
    });
}

let toolOverrides = {};

function registerNewTool(id, name, genOverride = null, runOverride = null) {
    let option = document.createElement('option');
    option.value = id;
    option.innerText = name;
    toolSelector.appendChild(option);
    let div = createDiv(`tool_${id}`, 'tool');
    toolContainer.appendChild(div);
    if (genOverride) {
        toolOverrides[id] = { 'text': genOverride, 'run': runOverride };
    }
    return div;
}

let notePadTool = registerNewTool('note_pad', 'Text Notepad');
notePadTool.appendChild(createDiv(`note_pad_tool_wrapper`, `note_pad_tool_wrapper`, `<span class="translate hoverable-minor-hint-text">This is an open text box where you can type any notes you need to keep track of. They will be temporarily persisted in browser session.</span><br><br><textarea id="note_pad_tool" class="auto-text" style="width:100%;height:100%;" placeholder="Type any notes here..."></textarea>`));
let notePadToolElem = getRequiredElementById('note_pad_tool');
notePadToolElem.value = localStorage.getItem('note_pad_tool') || '';
let notePadToolSaveEvent = null;
notePadToolElem.addEventListener('input', () => {
    if (notePadToolSaveEvent) {
        clearTimeout(notePadToolSaveEvent);
    }
    notePadToolSaveEvent = setTimeout(() => {
        localStorage.setItem('note_pad_tool', notePadToolElem.value);
    }, 1000);
    textBoxSizeAdjust(notePadToolElem);
});
notePadTool.addEventListener('tool-opened', () => {
    textBoxSizeAdjust(notePadToolElem);
});

function tweakNegativePromptBox() {
    let altNegText = getRequiredElementById('alt_negativeprompt_textbox');
    let cfgScale = document.getElementById('input_cfgscale');
    let cfgScaleVal = cfgScale ? parseFloat(cfgScale.value) : 7;
    if (cfgScaleVal == 1) {
        altNegText.classList.add('alt-negativeprompt-textbox-invalid');
        altNegText.placeholder = translate(`Negative Prompt is not available when CFG Scale is 1`);
    }
    else {
        altNegText.classList.remove('alt-negativeprompt-textbox-invalid');
        altNegText.placeholder = translate(`Optionally, type a negative prompt here...`);
    }
    altNegText.title = altNegText.placeholder;
}

/** Clears out and resets the image-batch view, only if the user wants that. */
function resetBatchIfNeeded() {
    if (autoClearBatchElem.checked) {
        clearBatch();
    }
}

function loadUserData(callback) {
    genericRequest('GetMyUserData', {}, data => {
        permissions.updateFrom(data.permissions);
        starredModels = data.starred_models;
        autoCompletionsList = {};
        if (data.autocompletions) {
            let allSet = [];
            autoCompletionsList['all'] = allSet;
            for (let val of data.autocompletions) {
                let split = val.split('\n');
                let datalist = autoCompletionsList[val[0]];
                let entry = { name: split[0], low: split[1].replaceAll(' ', '_').toLowerCase(), clean: split[1], raw: val, count: 0 };
                if (split.length > 3) {
                    entry.tag = split[2];
                }
                if (split.length > 4) {
                    count = parseInt(split[3]) || 0;
                    if (count) {
                        entry.count = count;
                        entry.count_display = largeCountStringify(count);
                    }
                }
                if (!datalist) {
                    datalist = [];
                    autoCompletionsList[val[0]] = datalist;
                }
                datalist.push(entry);
                allSet.push(entry);
            }
        }
        else {
            autoCompletionsList = null;
        }
        allPresets = data.presets;
        if (!language) {
            language = data.language;
        }
        sortPresets();
        presetBrowser.update();
        if (shouldApplyDefault) {
            shouldApplyDefault = false;
            let defaultPreset = getPresetByTitle('default');
            if (defaultPreset) {
                applyOnePreset(defaultPreset);
            }
        }
        if (callback) {
            callback();
        }
        loadAndApplyTranslations();
    });
}

function updateAllModels(models) {
    coreModelMap = models;
    allModels = models['Stable-Diffusion'];
    let selector = getRequiredElementById('current_model');
    let selectorVal = selector.value;
    selector.innerHTML = '';
    let emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.innerText = '';
    selector.appendChild(emptyOption);
    for (let model of allModels) {
        let option = document.createElement('option');
        let clean = cleanModelName(model);
        option.value = clean;
        option.innerText = clean;
        selector.appendChild(option);
    }
    selector.value = selectorVal;
    pickle2safetensor_load();
    modelDownloader.reloadFolders();
}

/** Set some element titles via JavaScript (to allow '\n'). */
function setTitles() {
    getRequiredElementById('alt_prompt_textbox').title = "Tell the AI what you want to see, then press Enter to submit.\nConsider 'a photo of a cat', or 'cartoonish drawing of an astronaut'";
    getRequiredElementById('alt_interrupt_button').title = "Interrupt current generation(s)\nRight-click for advanced options.";
    getRequiredElementById('alt_generate_button').title = "Start generating images\nRight-click for advanced options.";
    let oldGenerateButton = document.getElementById('generate_button');
    if (oldGenerateButton) {
        oldGenerateButton.title = getRequiredElementById('alt_generate_button').title;
        getRequiredElementById('interrupt_button').title = getRequiredElementById('alt_interrupt_button').title;
    }
}
setTitles();

function doFeatureInstaller(name, button_div_id, alt_confirm, callback = null, deleteButton = true) {
    if (!confirm(alt_confirm)) {
        return;
    }
    let buttonDiv = document.getElementById(button_div_id);
    if (buttonDiv) {
        buttonDiv.querySelector('button').disabled = true;
        buttonDiv.appendChild(createDiv('', null, 'Installing...'));
    }
    genericRequest('ComfyInstallFeatures', {'features': name}, data => {
        if (buttonDiv) {
            buttonDiv.appendChild(createDiv('', null, "Installed! Please wait while backends restart. If it doesn't work, you may need to restart Swarm."));
        }
        reviseStatusBar();
        setTimeout(() => {
            if (deleteButton && buttonDiv) {
                buttonDiv.remove();
            }
            hasAppliedFirstRun = false;
            reviseStatusBar();
            if (callback) {
                callback();
            }
        }, 8000);
    }, 0, (e) => {
        showError(e);
        if (buttonDiv) {
            buttonDiv.appendChild(createDiv('', null, 'Failed to install!'));
            buttonDiv.querySelector('button').disabled = false;
        }
    });
}

function installFeatureById(ids, buttonId = null, modalId = null) {
    let notice = '';
    for (let id of ids.split(',')) {
        let feature = comfy_features[id];
        if (!feature) {
            console.error(`Feature ID ${id} not found in comfy_features, can't install`);
            return;
        }
        notice += feature.notice + '\n';
    }
    doFeatureInstaller(ids, buttonId, notice.trim(), () => {
        if (modalId) {
            $(`#${modalId}`).modal('hide');
        }
    });
}

function installTensorRT() {
    doFeatureInstaller('comfyui_tensorrt', 'install_trt_button', `This will install TensorRT support developed by Comfy and NVIDIA.\nDo you wish to install?`, () => {
        getRequiredElementById('tensorrt_mustinstall').style.display = 'none';
        getRequiredElementById('tensorrt_modal_ready').style.display = '';
    });
}

function hideRevisionInputs() {
    let promptImageArea = getRequiredElementById('alt_prompt_image_area');
    promptImageArea.innerHTML = '';
    let clearButton = getRequiredElementById('alt_prompt_image_clear_button');
    clearButton.style.display = 'none';
    let revisionGroup = document.getElementById('input_group_imageprompting');
    let revisionToggler = document.getElementById('input_group_content_imageprompting_toggle');
    if (revisionGroup) {
        revisionToggler.checked = false;
        triggerChangeFor(revisionToggler);
        toggleGroupOpen(revisionGroup, false);
        revisionGroup.style.display = 'none';
    }
    genTabLayout.altPromptSizeHandle();
}

function showRevisionInputs(toggleOn = false) {
    let revisionGroup = document.getElementById('input_group_imageprompting');
    let revisionToggler = document.getElementById('input_group_content_imageprompting_toggle');
    if (revisionGroup) {
        toggleGroupOpen(revisionGroup, true);
        if (toggleOn) {
            revisionToggler.checked = true;
            triggerChangeFor(revisionToggler);
        }
        revisionGroup.style.display = '';
    }
}

function autoRevealRevision() {
    let promptImageArea = getRequiredElementById('alt_prompt_image_area');
    if (promptImageArea.children.length > 0) {
        showRevisionInputs();
    }
    else {
        hideRevisionInputs();
    }
}

function imagePromptAddImage(file) {
    let clearButton = getRequiredElementById('alt_prompt_image_clear_button');
    let promptImageArea = getRequiredElementById('alt_prompt_image_area');
    let reader = new FileReader();
    reader.onload = (e) => {
        let data = e.target.result;
        let imageContainer = createDiv(null, 'alt-prompt-image-container');
        let imageRemoveButton = createSpan(null, 'alt-prompt-image-container-remove-button', '&times;');
        imageRemoveButton.addEventListener('click', (e) => {
            imageContainer.remove();
            autoRevealRevision();
            genTabLayout.altPromptSizeHandle();
        });
        imageRemoveButton.title = 'Remove this image';
        imageContainer.appendChild(imageRemoveButton);
        let imageObject = new Image();
        imageObject.src = data;
        imageObject.height = 128;
        imageObject.className = 'alt-prompt-image';
        imageObject.dataset.filedata = data;
        imageContainer.appendChild(imageObject);
        clearButton.style.display = '';
        showRevisionInputs(true);
        promptImageArea.appendChild(imageContainer);
        genTabLayout.altPromptSizeHandle();
    };
    reader.readAsDataURL(file);
}

function imagePromptInputHandler() {
    let dragArea = getRequiredElementById('alt_prompt_region');
    dragArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    let clearButton = getRequiredElementById('alt_prompt_image_clear_button');
    clearButton.addEventListener('click', () => {
        hideRevisionInputs();
    });
    dragArea.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            for (let file of e.dataTransfer.files) {
                if (file.type.startsWith('image/')) {
                    imagePromptAddImage(file);
                }
            }
        }
    });
}
imagePromptInputHandler();

function imagePromptImagePaste(e) {
    let items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
        if (item.kind === 'file') {
            let file = item.getAsFile();
            if (file.type.startsWith('image/')) {
                imagePromptAddImage(file);
            }
        }
    }
}

function openEmptyEditor() {
    let canvas = document.createElement('canvas');
    canvas.width = document.getElementById('input_width').value;
    canvas.height = document.getElementById('input_height').value;
    let ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let image = new Image();
    image.onload = () => {
        imageEditor.clearVars();
        imageEditor.setBaseImage(image);
        imageEditor.activate();
    };
    image.src = canvas.toDataURL();
}

function upvertAutoWebuiMetadataToSwarm(metadata) {
    let realData = {};
    // Auto webui has no "proper formal" syntax like JSON or anything,
    // just a mishmash of text, and there's no way to necessarily predict newlines/colons/etc,
    // so just make best effort to import based on some easy examples
    if (metadata.includes("\nNegative prompt: ")) {
        let parts = splitWithTail(metadata, "\nNegative prompt: ", 2);
        realData['prompt'] = parts[0];
        let subSplit = parts[1].split("\n", 2);
        realData['negativeprompt'] = subSplit[0];
        metadata = subSplit[1];
    }
    else {
        let lines = metadata.split('\n');
        realData['prompt'] = lines.slice(0, lines.length - 1).join('\n');
        metadata = lines[lines.length - 1];
    }
    let lines = metadata.split('\n');
    if (lines.length > 0) {
        let dataParts = lines[lines.length - 1].split(',').map(x => x.split(':').map(y => y.trim()));
        for (let part of dataParts) {
            if (part.length == 2) {
                let clean = cleanParamName(part[0]);
                if (rawGenParamTypesFromServer.find(x => x.id == clean)) {
                    realData[clean] = part[1];
                }
                else if (clean == "size") {
                    let sizeParts = part[1].split('x').map(x => parseInt(x));
                    if (sizeParts.length == 2) {
                        realData['width'] = sizeParts[0];
                        realData['height'] = sizeParts[1];
                    }
                }
                else if (clean == "scheduletype") {
                    realData["scheduler"] = part[1].toLowerCase();
                }
                else {
                    realData[part[0]] = part[1];
                }
            }
        }
    }
    return JSON.stringify({ 'sui_image_params': realData });
}

let fooocusMetadataMap = [
    ['Prompt', 'prompt'],
    ['Negative', 'negativeprompt'],
    ['cfg', 'cfgscale'],
    ['sampler_name', 'sampler'],
    ['base_model_name', 'model'],
    ['denoise', 'imageinitcreativity']
];

function remapMetadataKeys(metadata, keymap) {
    for (let pair of keymap) {
        if (pair[0] in metadata) {
            metadata[pair[1]] = metadata[pair[0]];
            delete metadata[pair[0]];
        }
    }
    for (let key in metadata) {
        if (metadata[key] == null) { // Why does Fooocus emit nulls?
            delete metadata[key];
        }
    }
    return metadata;
}

const imageMetadataKeys = ['prompt', 'Prompt', 'parameters', 'Parameters', 'userComment', 'UserComment', 'model', 'Model'];

function interpretMetadata(metadata) {
    if (metadata instanceof Uint8Array) {
        let prefix = metadata.slice(0, 8);
        let data = metadata.slice(8);
        let encodeType = new TextDecoder().decode(prefix);
        if (encodeType.startsWith('UNICODE')) {
            if (data[0] == 0 && data[1] != 0) { // This is slightly dirty detection, but it works at least for English text.
                metadata = decodeUtf16LE(data);
            }
            else {
                metadata = decodeUtf16(data);
            }
        }
        else {
            metadata = new TextDecoder().decode(data);
        }
    }
    if (metadata) {
        metadata = metadata.trim();
        if (metadata.startsWith('{')) {
            let json = JSON.parse(metadata);
            if ('sui_image_params' in json) {
                // It's swarm, we're good
            }
            else if ("Prompt" in json) {
                // Fooocus
                json = remapMetadataKeys(json, fooocusMetadataMap);
                metadata = JSON.stringify({ 'sui_image_params': json });
            }
            else {
                // Don't know - discard for now.
                metadata = null;
            }
        }
        else {
            let lines = metadata.split('\n');
            if (lines.length > 1) {
                metadata = upvertAutoWebuiMetadataToSwarm(metadata);
            }
            else {
                // ???
                metadata = null;
            }
        }
    }
    return metadata;
}

function parseMetadata(data, callback) {
    exifr.parse(data).then(parsed => {
        if (parsed && imageMetadataKeys.some(key => key in parsed)) {
            return parsed;
        }
        return exifr.parse(data, imageMetadataKeys);
    }).then(parsed => {
        let metadata = null;
        if (parsed) {
            if (parsed.parameters) {
                metadata = parsed.parameters;
            }
            else if (parsed.Parameters) {
                metadata = parsed.Parameters;
            }
            else if (parsed.prompt) {
                metadata = parsed.prompt;
            }
            else if (parsed.UserComment) {
                metadata = parsed.UserComment;
            }
            else if (parsed.userComment) {
                metadata = parsed.userComment;
            }
            else if (parsed.model) {
                metadata = parsed.model;
            }
            else if (parsed.Model) {
                metadata = parsed.Model;
            }
        }
        metadata = interpretMetadata(metadata);
        callback(data, metadata);
    }).catch(err => {
        callback(data, null);
    });
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

function debugGenAPIDocs() {
    genericRequest('DebugGenDocs', { }, data => { });
}

let hashSubTabMapping = {
    'utilities_tab': 'utilitiestablist',
    'user_tab': 'usertablist',
    'server_tab': 'servertablist',
};

function updateHash() {
    let tabList = getRequiredElementById('toptablist');
    let bottomTabList = getRequiredElementById('bottombartabcollection');
    let activeTopTab = tabList.querySelector('.active');
    let activeBottomTab = bottomTabList.querySelector('.active');
    let activeBottomTabHref = activeBottomTab ? activeBottomTab.href.split('#')[1] : '';
    let activeTopTabHref = activeTopTab ? activeTopTab.href.split('#')[1] : '';
    let hash = `#${activeBottomTabHref},${activeTopTabHref}`;
    let subMapping = hashSubTabMapping[activeTopTabHref];
    if (subMapping) {
        let subTabList = getRequiredElementById(subMapping);
        let activeSubTab = subTabList.querySelector('.active');
        hash += `,${activeSubTab.href.split('#')[1]}`;
    }
    else if (activeTopTabHref == 'Simple') {
        let target = simpleTab.browser.selected || simpleTab.browser.folder;
        if (target) {
            hash += `,${encodeURIComponent(target)}`;
        }
    }
    history.pushState(null, null, hash);
}

function loadHashHelper() {
    let tabList = getRequiredElementById('toptablist');
    let bottomTabList = getRequiredElementById('bottombartabcollection');
    let tabs = [... tabList.getElementsByTagName('a')];
    tabs = tabs.concat([... bottomTabList.getElementsByTagName('a')]);
    for (let subMapping of Object.values(hashSubTabMapping)) {
        tabs = tabs.concat([... getRequiredElementById(subMapping).getElementsByTagName('a')]);
    }
    if (location.hash) {
        let split = location.hash.substring(1).split(',');
        let bottomTarget = bottomTabList.querySelector(`a[href='#${split[0]}']`);
        if (bottomTarget && bottomTarget.style.display != 'none') {
            bottomTarget.click();
        }
        let target = tabList.querySelector(`a[href='#${split[1]}']`);
        if (target) {
            target.click();
        }
        let subMapping = hashSubTabMapping[split[1]];
        if (subMapping && split.length > 2) {
            let subTabList = getRequiredElementById(subMapping);
            let subTarget = subTabList.querySelector(`a[href='#${split[2]}']`);
            if (subTarget) {
                subTarget.click();
            }
        }
        else if (split[1] == 'Simple' && split.length > 2) {
            let target = decodeURIComponent(split[2]);
            simpleTab.mustSelectTarget = target;
        }
    }
    for (let tab of tabs) {
        tab.addEventListener('click', (e) => {
            updateHash();
        });
    }
}

function storeImageToHistoryWithCurrentParams(img) {
    let data = getGenInput();
    data['image'] = img;
    delete data['initimage'];
    delete data['maskimage'];
    genericRequest('AddImageToHistory', data, res => {
        mainGenHandler.gotImageResult(res.images[0].image, res.images[0].metadata, '0');
    });
}

function clearParamFilterInput() {
    let filter = getRequiredElementById('main_inputs_filter');
    let filterClearer = getRequiredElementById('clear_input_icon');
    if (filter.value.length > 0) {
        filter.value = '';
        filter.focus();
        hideUnsupportableParams();
    }
    filterClearer.style.display = 'none';
}

function genpageLoad() {
    console.log('Load page...');
    $('#toptablist').on('shown.bs.tab', function (e) {
        let versionDisp = getRequiredElementById('version_display');
        if (e.target.id == 'maintab_comfyworkflow') {
            versionDisp.style.display = 'none';
        }
        else {
            versionDisp.style.display = '';
        }
    });
    window.imageEditor = new ImageEditor(getRequiredElementById('image_editor_input'), true, true, () => genTabLayout.reapplyPositions(), () => needsNewPreview());
    let editorSizebar = getRequiredElementById('image_editor_sizebar');
    window.imageEditor.onActivate = () => {
        editorSizebar.style.display = '';
    };
    window.imageEditor.onDeactivate = () => {
        editorSizebar.style.display = 'none';
    };
    window.imageEditor.tools['options'].optionButtons = [
        ... window.imageEditor.tools['options'].optionButtons,
        { key: 'Store Current Image To History', action: () => {
            let img = window.imageEditor.getFinalImageData();
            storeImageToHistoryWithCurrentParams(img);
        }},
        { key: 'Store Full Canvas To History', action: () => {
            let img = window.imageEditor.getMaximumImageData();
            storeImageToHistoryWithCurrentParams(img);
        }},
        { key: 'Auto Segment Image (SAM2)', action: () => {
            if (!currentBackendFeatureSet.includes('sam2')) {
                $('#sam2_installer').modal('show');
            }
            else {
                let img = window.imageEditor.getFinalImageData();
                let genData = getGenInput();
                genData['controlnetimageinput'] = img;
                genData['controlnetstrength'] = 1;
                genData['controlnetpreprocessor'] = 'Segment Anything 2 Global Autosegment base_plus';
                genData['images'] = 1;
                genData['prompt'] = '';
                delete genData['batchsize'];
                genData['donotsave'] = true;
                genData['controlnetpreviewonly'] = true;
                makeWSRequestT2I('GenerateText2ImageWS', genData, data => {
                    if (!data.image) {
                        return;
                    }
                    let newImg = new Image();
                    newImg.onload = () => {
                        imageEditor.addImageLayer(newImg);
                    };
                    newImg.src = data.image;
                });
            }
        }}
    ];
    genTabLayout.init();
    reviseStatusBar();
    loadHashHelper();
    getSession(() => {
        console.log('First session loaded - prepping page.');
        imageHistoryBrowser.navigate('');
        initialModelListLoad();
        loadBackendTypesMenu();
        genericRequest('ListT2IParams', {}, data => {
            updateAllModels(data.models);
            allWildcards = data.wildcards;
            rawGenParamTypesFromServer = sortParameterList(data.list);
            gen_param_types = rawGenParamTypesFromServer;
            paramConfig.preInit();
            paramConfig.applyParamEdits(data.param_edits);
            paramConfig.loadUserParamConfigTab();
            genInputs();
            genToolsList();
            reviseStatusBar();
            getRequiredElementById('advanced_options_checkbox').checked = localStorage.getItem('display_advanced') == 'true';
            toggle_advanced();
            setCurrentModel();
            loadUserData(() => {
                selectInitialPresetList();
            });
            for (let callback of sessionReadyCallbacks) {
                callback();
            }
            automaticWelcomeMessage();
        });
        reviseStatusInterval = setInterval(reviseStatusBar, 2000);
        window.resLoopInterval = setInterval(serverResourceLoop, 1000);
    });
}

setTimeout(genpageLoad, 1);
