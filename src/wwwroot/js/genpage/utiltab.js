

/** Triggers and process the clip tokenization utility. */
function utilClipTokenize() {
    let elem = getRequiredElementById('clip_tokenization_test_textarea');
    let resultLine = getRequiredElementById('clip_tokenization_result_line');
    function process() {
        elem.dataset.is_running_proc = true;
        genericRequest('TokenizeInDetail', { text: elem.value, skipPromptSyntax: true }, data => {
            let html = `<span style="width: 3rem; display: inline-block;">${data.tokens.length} tokens: </span>`;
            for (let token of data.tokens) {
                let text = token.text;
                let tweak = '';
                let postText = '';
                let title = '';
                if (text.endsWith('</w>')) {
                    text = text.substring(0, text.length - '</w>'.length);
                    tweak += ' clip-tokenization-word-tweak';
                    postText += '<span class="clip-tokenization-wordbreak">&lt;/w&gt;</span>';
                    title = "This token is the end of a word, meaning a word-break appears after (such as a space or punctuation).";
                }
                else {
                    title = "This token is a word-piece (as opposed to a word-end), meaning there is no word-break after it, it directly connects to the next token.";
                }
                let weightActual = roundToStr(token.weight, 2);
                let weightInfo = weightActual == 1 ? '' : `<span class="clip-tokenization-weight" title="Token weight = ${weightActual}">${weightActual}</span>`;
                html += `<span class="clip-tokenization-block${tweak}" title="${title}">${escapeHtml(text)}${postText}<br>${token.id}${weightInfo}</span>`;
            }
            resultLine.innerHTML = html;
            delete elem.dataset.is_running_proc;
            if (elem.dataset.needs_reprocess) {
                delete elem.dataset.needs_reprocess;
                process();
            }
        });
    }
    if (elem.dataset.is_running_proc) {
        elem.dataset.needs_reprocess = true;
    }
    else {
        process();
    }
}

function showPromptTokenizen(box) {
    let src = getRequiredElementById(box);
    let target = getRequiredElementById('clip_tokenization_test_textarea');
    target.value = src.value || src.innerText;
    getRequiredElementById('utilitiestabbutton').click();
    getRequiredElementById('cliptokentabbutton').click();
    triggerChangeFor(target);
}

/** Preloads conversion data. */
function pickle2safetensor_load(mapping = null) {
    if (mapping == null) {
        mapping = coreModelMap;
    }
    for (let type of ['Stable-Diffusion', 'LoRA', 'VAE', 'Embedding', 'ControlNet']) {
        let modelSet = mapping[type];
        let count = modelSet.filter(x => !x.startsWith("backup") && x != "(None)" && !nativelySupportedModelExtensions.includes(x.split('.').pop())).length;
        let counter = getRequiredElementById(`pickle2safetensor_${type.toLowerCase()}_count`);
        counter.innerText = count;
        let button = getRequiredElementById(`pickle2safetensor_${type.toLowerCase()}_button`);
        button.disabled = count == 0;
    }
}

/** Triggers the actual conversion process. */
function pickle2safetensor_run(type) {
    let fp16 = getRequiredElementById(`pickle2safetensor_fp16`).checked;
    let button = getRequiredElementById(`pickle2safetensor_${type.toLowerCase()}_button`);
    button.disabled = true;
    let notif = getRequiredElementById('pickle2safetensor_text_area');
    notif.innerText = "Running, please wait ... monitor debug console for details...";
    genericRequest('Pickle2SafeTensor', { type: type, fp16: fp16 }, data => {
        notif.innerText = "Done!";
        genericRequest('TriggerRefresh', {}, data => {
            genericRequest('ListT2IParams', {}, data => {
                pickle2safetensor_load(data.models);
            });
        });
    });
}

function util_massMetadataClear() {
    let button = getRequiredElementById('util_massmetadataclear_button');
    button.disabled = true;
    genericRequest('WipeMetadata', {}, data => {
        genericRequest('TriggerRefresh', {}, data => {
            button.disabled = false;
            for (let browser of allModelBrowsers) {
                browser.browser.refresh();
            }
        });
    });
}

class LoraExtractorUtil {
    constructor() {
        this.tabHeader = getRequiredElementById('loraextractortabbutton');
        this.baseInput = getRequiredElementById('lora_extractor_base_model');
        this.otherInput = getRequiredElementById('lora_extractor_other_model');
        this.rankInput = getRequiredElementById('lora_extractor_rank');
        this.nameInput = getRequiredElementById('lora_extractor_name');
        this.textArea = getRequiredElementById('lora_extractor_text_area');
        this.progressBar = getRequiredElementById('lora_extractor_special_progressbar');
        this.tabHeader.addEventListener('click', () => this.refillInputModels());
    }

    refillInputModels() {
        let html = '';
        for (let model of allModels.filter(m => !m.endsWith('.engine'))) {
            html += `<option>${cleanModelName(model)}</option>`;
        }
        let baseSelected = this.baseInput.value;
        let otherSelected = this.otherInput.value;
        this.baseInput.innerHTML = html;
        this.otherInput.innerHTML = html;
        this.baseInput.value = baseSelected;
        this.otherInput.value = otherSelected;
    }

    run() {
        let baseModel = this.baseInput.value;
        let otherModel = this.otherInput.value;
        let rank = this.rankInput.value;
        let outName = this.nameInput.value.replaceAll('\\', '/');
        while (outName.includes('//')) {
            outName = outName.replaceAll('//', '/');
        }
        if (outName.startsWith('/')) {
            outName = outName.substring(1);
        }
        if (outName.endsWith('.safetensors')) {
            outName = outName.substring(0, outName.length - '.safetensors'.length);
        }
        if (outName.endsWith('.sft')) {
            outName = outName.substring(0, outName.length - '.sft'.length);
        }
        if (outName.endsWith('.ckpt')) {
            outName = outName.substring(0, outName.length - '.ckpt'.length);
        }
        if (!baseModel || !otherModel || !outName) {
            this.textArea.innerText = "Missing required values, cannot extract.";
            return;
        }
        if (coreModelMap['LoRA'].includes(outName)) {
            if (!confirm("That output name is already taken, are you sure you want to overwrite it?")) {
                return;
            }
        }
        this.textArea.innerText = "Running, please wait...";
        let overall = this.progressBar.querySelector('.image-preview-progress-overall');
        let current = this.progressBar.querySelector('.image-preview-progress-current');
        makeWSRequest('DoLoraExtractionWS', { baseModel: baseModel, otherModel: otherModel, rank: rank, outName: outName }, data => {
            if (data.overall_percent) {
                overall.style.width = `${data.overall_percent * 100}%`;
                current.style.width = `${data.current_percent * 100}%`;
            }
            else if (data.success) {
                this.textArea.innerText = "Done!";
                refreshParameterValues(true);
                overall.style.width = `0%`;
                current.style.width = `0%`;
            }
        }, 0, e => {
            this.textArea.innerText = `Error: ${e}`;
            overall.style.width = `0%`;
            current.style.width = `0%`;
        });
    }
}

loraExtractor = new LoraExtractorUtil();

class ModelDownloaderUtil {
    constructor() {
        this.tabHeader = getRequiredElementById('modeldownloadertabbutton');
        this.url = getRequiredElementById('model_downloader_url');
        this.urlStatusArea = getRequiredElementById('model_downloader_status');
        this.type = getRequiredElementById('model_downloader_type');
        this.name = getRequiredElementById('model_downloader_name');
        this.button = getRequiredElementById('model_downloader_button');
        this.metadataZone = getRequiredElementById('model_downloader_metadatazone');
        this.imageSide = getRequiredElementById('model_downloader_imageside');
        this.activeZone = getRequiredElementById('model_downloader_right_sidebar');
        this.folders = getRequiredElementById('model_downloader_folder');
        this.hfPrefix = 'https://huggingface.co/';
        this.civitPrefix = 'https://civitai.com/';
        this.civitGreenPrefix = 'https://civitai.green/';
    }

    buildFolderSelector(selector) {
        if (!coreModelMap) {
            return;
        }
        let html = '<option>(None)</option>';
        let folderList = [];
        for (let submap of Object.values(coreModelMap)) {
            for (let model of submap) {
                let parts = model.split('/');
                if (parts.length == 1) {
                    continue;
                }
                if (folderList.includes(parts.slice(0, -1).join('/'))) {
                    continue;
                }
                for (let i = 1; i < parts.length; i++) {
                    let folder = parts.slice(0, i).join('/');
                    if (!folderList.includes(folder)) {
                        folderList.push(folder);
                    }
                }
            }
        }
        folderList.sort();
        for (let folder of folderList) {
            html += `<option>${folder}</option>\n`;
        }
        selector.innerHTML = html;
    }

    reloadFolders() {
        if (!coreModelMap) {
            return;
        }
        let selected = this.folders.value;
        this.buildFolderSelector(this.folders);
        this.folders.value = selected || '(None)';
    }

    searchCivitaiForHash(hash, callback) {
        if (hash.startsWith('0x')) {
            hash = hash.substring(2);
        }
        hash = hash.substring(0, 12);
        genericRequest('ForwardMetadataRequest', { 'url': `${this.civitPrefix}api/v1/model-versions/by-hash/${hash}` }, (rawData) => {
            if (rawData.response['error']) {
                callback(null);
                return;
            }
            callback(`https://civitai.com/models/${rawData.response.modelId}?modelVersionId=${rawData.response.id}`);
        }, 0, () => {
            callback(null);
        });
    }

    getCivitaiMetadata(id, versId, callback, identifier = '', validateSafe = true) {
        let doError = (msg = null) => {
            callback(null, null, null, null, null, null, null, msg);
        }
        genericRequest('ForwardMetadataRequest', { 'url': `${this.civitPrefix}api/v1/models/${id}` }, (rawData) => {
            rawData = rawData.response;
            if (!rawData) {
                console.log(`refuse civitai url because response is empty - for model id ${id} / ${identifier}`);
                doError();
                return;
            }
            let modelType = null;
            let metadata = null;
            let rawVersion = rawData.modelVersions[0];
            let file = rawVersion.files[0];
            if (versId) {
                for (let vers of rawData.modelVersions) {
                    for (let vFile of vers.files) {
                        if (vFile.downloadUrl.endsWith(`/${versId}`)) {
                            rawVersion = vers;
                            file = vFile;
                            break;
                        }
                    }
                }
            }
            else {
                baseLoop:
                for (let vers of rawData.modelVersions) {
                    for (let vFile of vers.files) {
                        if (vFile.name.endsWith(`.safetensors`) || vFile.name.endsWith(`.sft`)) {
                            rawVersion = vers;
                            file = vFile;
                            break baseLoop;
                        }
                    }
                }
            }
            if (validateSafe && !file.name.endsWith('.safetensors') && !file.name.endsWith('.sft')) {
                console.log(`refuse civitai url because download url is ${file.downloadUrl} / ${file.name} / ${identifier}`);
                doError(`Cannot download model from that URL because it is not a safetensors file. Filename is '${file.name}'`);
                return;
            }
            if (rawData.type == 'Checkpoint') { modelType = 'Stable-Diffusion'; }
            if (['LORA', 'LoCon', 'LyCORIS'].includes(rawData.type)) { modelType = 'LoRA'; }
            if (rawData.type == 'TextualInversion') { modelType = 'Embedding'; }
            if (rawData.type == 'ControlNet') { modelType = 'ControlNet'; }
            if (rawData.type == 'VAE') { modelType = 'VAE'; }
            let imgs = rawVersion.images ? rawVersion.images.filter(img => img.type == 'image') : [];
            let applyMetadata = (img) => {
                let url = versId ? `${this.civitPrefix}models/${id}?modelVersionId=${versId}` : `${this.civitPrefix}models/${id}`;
                metadata = {
                    'modelspec.title': `${rawData.name} - ${rawVersion.name}`,
                    'modelspec.description': `From <a href="${url}" target="_blank">${url}</a>\n${rawVersion.description || ''}\n${rawData.description}\n`,
                    'modelspec.date': rawVersion.createdAt,
                };
                if (rawData.creator) {
                    metadata['modelspec.author'] = rawData.creator.username;
                }
                if (rawVersion.trainedWords) {
                    metadata['modelspec.trigger_phrase'] = rawVersion.trainedWords.join(", ");
                }
                if (rawData.tags) {
                    metadata['modelspec.tags'] = rawData.tags.join(", ");
                }
                if (img) {
                    metadata['modelspec.thumbnail'] = img;
                }
                if (['Illustrious', 'Pony'].includes(rawVersion.baseModel)) {
                    metadata['modelspec.usage_hint'] = rawVersion.baseModel;
                }
                callback(rawData, rawVersion, metadata, modelType, file.downloadUrl, img, imgs.map(x => x.url), null);
            }
            if (imgs.length > 0) {
                imageToData(imgs[0].url, img => applyMetadata(img));
            }
            else {
                let videos = rawVersion.images ? rawVersion.images.filter(img => img.type == 'video') : [];
                if (videos) {
                    let url = videos[0].url;
                    let video = document.createElement('video');
                    video.crossOrigin = 'Anonymous';
                    video.onloadeddata = () => {
                        let canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                        applyMetadata(canvas.toDataURL());
                    };
                    video.src = url;
                }
                else {
                    applyMetadata('');
                }
            }
        }, 0, (status, data) => {
            doError();
        });
    }

    parseCivitaiUrl(url) {
        url = url.trim();
        if (url.startsWith(this.civitGreenPrefix)) {
            url = this.civitPrefix + url.substring(this.civitGreenPrefix.length);
        }
        let parts = splitWithTail(url.substring(this.civitPrefix.length), '/', 4); // 'models', id, name + sometimes version OR 'api', 'download', 'models', versid
        if (parts.length == 2 && parts[0] == 'models' && parts[1].includes('?')) {
            let subparts = splitWithTail(parts[1], '?', 2);
            parts = ['models', subparts[0], `?${subparts[1]}`];
        }
        else if (parts.length == 2 && parts[0] == 'models' && !isNaN(parseInt(parts[1]))) {
            parts = ['models', parts[1], ''];
        }
        if (parts.length < 3) {
            return [null, null];
        }
        if (parts[0] == 'models') {
            let subparts = splitWithTail(parts[2], '?modelVersionId=', 2);
            if (subparts.length == 2) {
                return [parts[1], subparts[1]];
            }
            else {
                return [parts[1], null];
            }
        }
        return [null, null];
    }

    urlInput() {
        this.metadataZone.innerHTML = '';
        this.metadataZone.dataset.raw = '';
        this.imageSide.innerHTML = '';
        let url = this.url.value.trim();
        if (url.endsWith('.pt') || url.endsWith('.pth') || url.endsWith('.ckpt') || url.endsWith('.bin')) {
            this.urlStatusArea.innerText = "URL looks to be a pickle file, cannot download. Only safetensors can be auto-downloaded. Pickle files may contain malware.";
            this.button.disabled = true;
            return;
        }
        if (url.startsWith(this.hfPrefix)) {
            let parts = splitWithTail(url.substring(this.hfPrefix.length), '/', 5); // org, repo, 'blob', branch, filepath
            if (parts.length < 5) {
                this.urlStatusArea.innerText = "URL appears to be a huggingface link, but not a specific file. Please use the path of a specific file inside the repo.";
                this.button.disabled = true;
                return;
            }
            if (parts[4].endsWith('?download=true')) {
                parts[4] = parts[4].substring(0, parts[4].length - '?download=true'.length);
                this.url.value = `${this.hfPrefix}${parts.join('/')}`;
            }
            if (!parts[4].endsWith('.safetensors') && !parts[4].endsWith('.sft')) {
                this.urlStatusArea.innerText = "URL appears to be a huggingface link, but not a safetensors file. Only safetensors can be auto-downloaded.";
                this.button.disabled = true;
                return;
            }
            if (parts[2] == 'blob') {
                parts[2] = 'resolve';
                this.url.value = `${this.hfPrefix}${parts.join('/')}`;
                this.urlStatusArea.innerText = "URL appears to be a huggingface link, and has been autocorrected to a download link.";
                this.button.disabled = false;
                this.name.value = parts.slice(4).join('/').replaceAll('.safetensors', '').replaceAll('.sft', '');
                this.nameInput();
                return;
            }
            if (parts[2] == 'resolve') {
                this.urlStatusArea.innerText = "URL appears to be a valid HuggingFace download link.";
                this.button.disabled = false;
                this.name.value = parts.slice(4).join('/').replaceAll('.safetensors', '').replaceAll('.sft', '');
                this.nameInput();
                return;
            }
            this.urlStatusArea.innerText = "URL appears to be a huggingface link, but seems to not be valid. Please double-check the link.";
            this.button.disabled = false;
            return;
        }
        if (url.startsWith(this.civitGreenPrefix)) {
            url = this.civitPrefix + url.substring(this.civitGreenPrefix.length);
        }
        if (url.startsWith(this.civitPrefix)) {
            let parts = splitWithTail(url.substring(this.civitPrefix.length), '/', 4); // 'models', id, name + sometimes version OR 'api', 'download', 'models', versid
            if (parts.length == 2 && parts[0] == 'models' && parts[1].includes('?')) {
                let subparts = splitWithTail(parts[1], '?', 2);
                parts = ['models', subparts[0], `?${subparts[1]}`];
            }
            else if (parts.length == 2 && parts[0] == 'models' && !isNaN(parseInt(parts[1]))) {
                parts = ['models', parts[1], ''];
            }
            let loadMetadata = (id, versId) => {
                this.getCivitaiMetadata(id, versId, (rawData, rawVersion, metadata, modelType, url, img, imgs, errMsg) => {
                    if (!rawData) {
                        this.urlStatusArea.innerText = `URL appears to be a CivitAI link, but seems to not be valid. Please double-check the link. ${(errMsg ?? '')}`;
                        this.nameInput();
                        return;
                    }
                    this.url.value = url;
                    if (modelType) {
                        this.type.value = modelType;
                    }
                    this.urlStatusArea.innerText = "URL appears to be a CivitAI link, and has been loaded from Civitai API.";
                    this.name.value = `${rawData.name} - ${rawVersion.name}`.replaceAll(/[\|\\\/\:\*\?\"\<\>\|\,\.\&\!\[\]\(\)]/g, '-');
                    this.nameInput();
                    this.metadataZone.innerHTML = `
                        Found civitai metadata for model ID ${escapeHtml(id)} version id ${escapeHtml(versId)}:
                        <br><b>Model title</b>: ${escapeHtml(rawData.name)}
                        <br><b>Version title</b>: ${escapeHtml(rawVersion.name)}
                        <br><b>Base model</b>: ${escapeHtml(rawVersion.baseModel)}
                        <br><b>Date</b>: ${escapeHtml(rawVersion.createdAt)}`
                        + `<br><b>Model description</b>: ${safeHtmlOnly(rawData.description)}`
                        + (rawVersion.description ? `<br><b>Version description</b>: ${safeHtmlOnly(rawVersion.description)}` : '')
                        + (rawVersion.trainedWords ? `<br><b>Trained words</b>: ${escapeHtml(rawVersion.trainedWords.join(", "))}` : '');
                    this.metadataZone.dataset.raw = `${JSON.stringify(metadata, null, 2)}`;
                    if (img) {
                        this.metadataZone.dataset.image = img;
                        this.imageSide.innerHTML = `<img src="${img}"/>`;
                        if (imgs.length > 1) {
                            this.imageSide.innerHTML += `<br><div class="model_downloader_imageselector">
                                    <button class="image-select-prev basic-button">Previous</button>
                                    <button class="image-select-next basic-button">Next</button>
                                </div>`;
                            let imgElem = this.imageSide.querySelector('img');
                            let prevButton = this.imageSide.querySelector('.image-select-prev');
                            let nextButton = this.imageSide.querySelector('.image-select-next');
                            let imgIndex = 0;
                            let updateImage = () => {
                                imgIndex = (imgIndex + imgs.length) % imgs.length;
                                let ind = imgIndex;
                                let url = imgs[imgIndex];
                                if (url.startsWith('data:')) {
                                    this.metadataZone.dataset.image = url;
                                    imgElem.src = url;
                                }
                                else {
                                    imageToData(url, (img) => {
                                        imgs[ind] = img;
                                        this.metadataZone.dataset.image = img;
                                        imgElem.src = img;
                                    });
                                }
                            };
                            prevButton.onclick = () => { imgIndex--; updateImage(); };
                            nextButton.onclick = () => { imgIndex++; updateImage(); };
                        }
                    }
                    else {
                        delete this.metadataZone.dataset.image;
                        this.imageSide.innerHTML = ``;
                    }
                });
            }
            if (parts.length < 3) {
                this.urlStatusArea.innerText = "URL appears to be a CivitAI link, but not a specific model. Please use the path of a specific model.";
                this.nameInput();
                return;
            }
            if (parts[0] == 'models') {
                let [id, versId] = this.parseCivitaiUrl(url);
                if (id) {
                    if (versId) {
                        this.url.value = `${this.civitPrefix}api/download/models/${versId}`;
                        this.urlStatusArea.innerText = "URL appears to be a CivitAI link, and has been autocorrected to a download link.";
                        this.nameInput();
                    }
                    loadMetadata(id, versId);
                    return;
                }
                this.urlStatusArea.innerText = "URL appears to be a CivitAI link, but is missing a version ID. Please double-check the link.";
                this.nameInput();
                return;
            }
            if (parts[0] == 'api' && parts[1] == 'download' && parts[2] == 'models') {
                this.urlStatusArea.innerText = "URL appears to be a valid CivitAI download link.";
                this.nameInput();
                loadMetadata(parts[3], null);
                return;
            }
            this.urlStatusArea.innerText = "URL appears to be a CivitAI link, but seems to not be valid. Attempting to check it...";
            this.nameInput();
            return;
        }
        else {
            this.metadataZone.innerHTML = '';
            this.metadataZone.dataset.raw = '';
            this.imageSide.innerHTML = '';
        }
        if (url.trim() == '') {
            this.urlStatusArea.innerText = "(...)";
            this.button.disabled = true;
            return;
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            this.urlStatusArea.innerText = "URL is not a valid link (should start with 'https://').";
            this.button.disabled = true;
            return;
        }
        this.urlStatusArea.innerText = "URL is unrecognized but looks valid.";
        this.nameInput();
        return;
    }

    nameInput() {
        this.button.disabled = false;
        if (this.name.value.trim() == '') {
            this.name.style.borderColor = 'red';
            this.button.disabled = true;
        }
        else {
            this.name.style.borderColor = '';
        }
        if (this.url.value.trim() == '') {
            this.url.style.borderColor = 'red';
            this.button.disabled = true;
        }
        else {
            this.url.style.borderColor = '';
        }
        if (this.name.value.includes(' ')) {
            this.name.value = this.name.value.replaceAll(' ', '_');
        }
    }

    run() {
        this.button.disabled = true;
        let name = this.folders.value == '(None)' ? this.name.value : this.folders.value + '/' + this.name.value;
        let download = new ActiveModelDownload(this, name, this.url.value, this.metadataZone.dataset.image, this.type.value, this.metadataZone.dataset.raw || '');
        download.download();
    }
}

class ActiveModelDownload {
    constructor(downloader, name, url, image, type, metadata) {
        this.downloader = downloader;
        this.name = name;
        this.url = url;
        this.image = image;
        if (image && metadata) {
            metadata = JSON.parse(metadata);
            metadata['modelspec.thumbnail'] = image;
            metadata = JSON.stringify(metadata);
        }
        this.type = type;
        this.metadata = metadata;
        let cardHtml = `
            <div class="card">
                <div class="card-header">[${type}] ${escapeHtml(name)}</div>
                ${image ? `<img src="${image}" class="card-img-top" alt="Model thumbnail">` : ''}
                <div class="lora_extractor_special"><div class="image-preview-progress-overall"></div><div class="image-preview-progress-current"></div></div>
                <div class="status-text">Preparing...</div>
                <button class="basic-button" title="Cancel this download" disabled>Cancel</button>
            </div>
        `;
        this.mainDiv = createDiv(null, 'active-model-download-card', cardHtml);
        this.card = this.mainDiv.querySelector('.card');
        downloader.activeZone.insertBefore(this.mainDiv, downloader.activeZone.firstChild);
        this.overall = this.card.querySelector('.image-preview-progress-overall');
        this.current = this.card.querySelector('.image-preview-progress-current');
        this.statusText = this.card.querySelector('.status-text');
        this.cancelButton = this.card.querySelector('button');
    }

    isDone() {
        this.overall.style.width = `0%`;
        this.current.style.width = `0%`;
        this.cancelButton.disabled = true;
        delete this.cancelButton.onclick;
        setTimeout(() => {
            this.cancelButton.innerText = "Remove";
            this.cancelButton.onclick = () => {
                this.mainDiv.remove();
            };
            this.cancelButton.disabled = false;
        }, 2000);
    }

    setBorderColor(color) {
        this.card.style.borderColor = color;
    }

    download() {
        let data = {
            'url': this.url,
            'type': this.type,
            'name': this.name,
            'metadata': this.metadata,
        }
        this.statusText.innerText = "Downloading, please wait...";
        this.setBorderColor('#0000aa');
        makeWSRequest('DoModelDownloadWS', data, data => {
            if (data.overall_percent) {
                this.overall.style.width = `${data.overall_percent * 100}%`;
                this.current.style.width = `${data.current_percent * 100}%`;
                this.statusText.innerText = `Downloading, please wait... ${roundToStr(data.current_percent * 100, 1)}% (${fileSizeStringify(data.per_second)} per second)`;
            }
            else if (data.success) {
                this.statusText.innerText = "Done!";
                this.setBorderColor('#00aa00');
                refreshParameterValues(true);
                this.isDone();
            }
        }, 0, e => {
            let hintInfo = `Are you sure the URL is correct? Note some models may require you to authenticate using an <a href="#" onclick="getRequiredElementById('usersettingstabbutton').click();getRequiredElementById('userinfotabbutton').click();">API Key</a>.`;
            if (e == "Download was cancelled.") {
                hintInfo = "";
                this.setBorderColor('#aaaa00');
            }
            else if (e == "Model at that save path already exists." || e == "Invalid type.") {
                this.setBorderColor('#aa0000');
                hintInfo = "";
            }
            else {
                this.setBorderColor('#aa0000');
            }
            this.statusText.innerHTML = `Error: ${escapeHtml(e)}\n<br>${hintInfo}<br><br><button class="basic-button" title="Restart the download" style="width:98%">Retry</button><br><br>`;
            this.statusText.querySelector('button').onclick = () => {
                this.download();
            };
            this.isDone();
        }, socket => {
            this.cancelButton.onclick = () => {
                socket.send(`{ "signal": "cancel" }`);
                this.setBorderColor('#aaaa00');
            };
            this.cancelButton.disabled = false;
        });
    }
}

modelDownloader = new ModelDownloaderUtil();

class ModelMetadataScanner {
    constructor() {
        this.button = getRequiredElementById('util_modelmetadatascanner_button');
        this.subTypeSelector = getRequiredElementById('util_modelmetadatascanner_subtype');
        this.dateSelector = getRequiredElementById('util_modelmetadatascanner_date');
        this.filterSelector = getRequiredElementById('util_modelmetadatascanner_requirements');
        this.replaceSelector = getRequiredElementById('util_modelmetadatascanner_replace');
        this.nameFilter = getRequiredElementById('util_modelmetadatascanner_filter');
        this.resultArea = getRequiredElementById('util_modelmetadatascanner_result');
        this.maxSimulLoads = 30;
    }

    async runForList(list) {
        if (this.button.disabled) {
            return;
        }
        this.button.disabled = true;
        let date = this.dateSelector.value;
        let filter = this.filterSelector.value;
        let replace = this.replaceSelector.value;
        let nameFilter = this.nameFilter.value;
        let nameMatcher = simpleAsteriskedMatcher(nameFilter);
        let timeNow = new Date().getTime();
        let running = 0;
        let scanned = 0;
        let updated = 0;
        let failed = 0;
        let skipped = 0;
        let invalidDescriptions = ['', '(None)', '(Unset)'];
        let relisted = [];
        for (let key of list) {
            if (key.name != '(None)' && nameMatcher(key.name)) {
                relisted.push(key);
            }
        }
        list = relisted;
        let update = () => {
            this.resultArea.innerText = `${running} scans currently running, already scanned ${scanned} models, ${failed} couldn't be found on civitai, ${skipped} skipped, ${updated} models updated with new metadata. Remaining: ${list.length - scanned - failed - skipped} / ${list.length}`;
        };
        let removeOne = () => {
            running--;
            update();
        }
        for (let key of list) {
            while (running >= this.maxSimulLoads) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            running++;
            update();
            genericRequest('DescribeModel', { 'modelName': key.name, 'subtype': key.type }, data => {
                let model = data.model;
                if (date != 'all') {
                    let createTime = new Date(model.time_created).getTime();
                    let limit = 24 * 60 * 60 * 1000;
                    if (date == 'week') {
                        limit *= 7;
                    }
                    else if (date == 'month') {
                        limit *= 31;
                    }
                    if (timeNow - createTime > limit) {
                        skipped++;
                        removeOne();
                        return;
                    }
                }
                let civitUrl = getCivitUrlGuessFor(model);
                if (filter != 'all') {
                    let allowed = true;
                    if (filter == 'no_thumbnail' && model.preview_image && model.preview_image != 'imgs/model_placeholder.jpg') {
                        allowed = false;
                    }
                    else if (filter == 'no_description' && !invalidDescriptions.includes(model.description.trim())) {
                        allowed = false;
                    }
                    else if (filter == 'no_author' && model.author) {
                        allowed = false;
                    }
                    else if (filter == 'explicit_url' && !civitUrl) {
                        allowed = false;
                    }
                    if (!allowed) {
                        skipped++;
                        removeOne();
                        return;
                    }
                }
                let doApply = () => {
                    let [id, versId] = modelDownloader.parseCivitaiUrl(civitUrl);
                    modelDownloader.getCivitaiMetadata(id, versId, (rawData, rawVersion, metadata, modelType, url, img, imgs, errMsg) => {
                        if (!rawData) {
                            failed++;
                            removeOne();
                            return;
                        }
                        let backup = JSON.parse(JSON.stringify(model));
                        if (replace == 'all') {
                            model.preview_image = img || model.preview_image;
                            model.title = metadata['modelspec.title'] || model.title;
                            model.description = metadata['modelspec.description'] || model.description;
                            model.author = metadata['modelspec.author'] || model.author;
                            model.date = metadata['modelspec.date'] || model.date;
                            model.trigger_phrase = metadata['modelspec.trigger_phrase'] || model.trigger_phrase;
                            model.usage_hint = metadata['modelspec.usage_hint'] || model.usage_hint;
                            if (metadata['modelspec.tags']) {
                                model.tags = metadata['modelspec.tags'].split(',').map(x => x.trim());
                            }
                        }
                        else if (replace == 'only_missing') {
                            if (img && (!model.preview_image || model.preview_image == 'imgs/model_placeholder.jpg')) {
                                model.preview_image = img;
                            }
                            model.title = model.title || metadata['modelspec.title'];
                            model.description = model.description || metadata['modelspec.description'];
                            model.author = model.author || metadata['modelspec.author'];
                            model.date = model.date || metadata['modelspec.date'];
                            model.trigger_phrase = model.trigger_phrase || metadata['modelspec.trigger_phrase'];
                            model.usage_hint = model.usage_hint || metadata['modelspec.usage_hint'];
                            if (metadata['modelspec.tags'] && !model.tags) {
                                model.tags = metadata['modelspec.tags'].split(',').map(x => x.trim());
                            }
                        }
                        else if (replace == 'only_thumbnail') {
                            model.preview_image = img || model.preview_image;
                        }
                        else if (replace == 'only_text') {
                            model.title = metadata['modelspec.title'] || model.title;
                            model.description = metadata['modelspec.description'] || model.description;
                            model.author = metadata['modelspec.author'] || model.author;
                            model.date = metadata['modelspec.date'] || model.date;
                            model.trigger_phrase = metadata['modelspec.trigger_phrase'] || model.trigger_phrase;
                            model.usage_hint = metadata['modelspec.usage_hint'] || model.usage_hint;
                            if (metadata['modelspec.tags']) {
                                model.tags = metadata['modelspec.tags'].split(',').map(x => x.trim());
                            }
                        }
                        scanned++;
                        update();
                        let tagsMatch = (!model.tags == !backup.tags) && (!model.tags || backup.tags.join(', ') == model.tags.join(', '));
                        let anyChanged = backup.preview_image != model.preview_image || backup.title != model.title || backup.description != model.description || backup.author != model.author || backup.date != model.date || backup.trigger_phrase != model.trigger_phrase || backup.usage_hint != model.usage_hint || !tagsMatch;
                        if (!anyChanged) {
                            removeOne();
                            return;
                        }
                        console.log(`Model ${key.name} (${key.type}) - change report: image: ${backup.preview_image != model.preview_image}, title: ${backup.title != model.title}, description: ${backup.description != model.description}, author: ${backup.author != model.author}, date: ${backup.date != model.date}, trigger: ${backup.trigger_phrase != model.trigger_phrase}, usage_hint: ${backup.usage_hint != model.usage_hint}, tags: ${!tagsMatch}`);
                        let newMetadata = {
                            'model': key.name,
                            'subtype': key.type,
                            'title': model.title || '',
                            'author': model.author || '',
                            'type': model.architecture || '',
                            'description': model.description || '',
                            'standard_width': model.standard_width || 0,
                            'standard_height': model.standard_height || 0,
                            'usage_hint': model.usage_hint || '',
                            'date': model.date || '',
                            'license': model.license || '',
                            'trigger_phrase': model.trigger_phrase || '',
                            'usage_hint': model.usage_hint || '',
                            'prediction_type': model.prediction_type || '',
                            'tags': model.tags ? model.tags.join(', ') : null,
                            'preview_image': model.preview_image == "imgs/model_placeholder.jpg" ? null : model.preview_image,
                            'preview_image_metadata': null,
                            'is_negative_embedding': model.is_negative_embedding
                        };
                        genericRequest('EditModelMetadata', newMetadata, data => {
                            updated++;
                            removeOne();
                        }, 0, e => {
                            failed++;
                            removeOne();
                        });
                    }, model.name, false);
                };
                if (civitUrl) {
                    doApply();
                }
                else {
                    let applyWithHash = () => {
                        modelDownloader.searchCivitaiForHash(model.hash, url => {
                            civitUrl = url;
                            if (civitUrl) {
                                doApply();
                            }
                            else {
                                failed++;
                                removeOne();
                            }
                        });
                    };
                    if (model.hash) {
                        applyWithHash();
                    }
                    else {
                        genericRequest('GetModelHash', { 'modelName': key.name, 'subtype': key.type }, data => {
                            model.hash = data.hash;
                            applyWithHash();
                        }, 0, e => { failed++; removeOne(); });
                    }
                }
            }, 0, e => {  failed++; removeOne(); });
        }
        while (running > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        this.button.disabled = false;
        this.resultArea.innerText = `All scans completed: ${scanned} models scanned, ${failed} couldn't be found on civitai, ${updated} models updated with new metadata.`;
    }

    run() {
        if (!confirm("This may take a long time, and may replace data, and cannot be undone. Your browser must stay open while this runs. Are you sure you want to proceed?")) {
            return;
        }
        let subType = this.subTypeSelector.value;
        if (subType == 'all') {
            let list = [];
            for (let type of Object.keys(coreModelMap)) {
                let names = coreModelMap[type];
                for (let name of names) {
                    list.push({ 'name': name, 'type': type });
                }
            }
            this.runForList(list);
        }
        else {
            let names = coreModelMap[subType];
            if (names == null) {
                this.resultArea.innerText = "Invalid subtype.";
                return;
            }
            let list = [];
            for (let name of names) {
                list.push({ 'name': name, 'type': subType });
            }
            this.runForList(list);
        }
    }
}

modelMetadataScanner = new ModelMetadataScanner();
