
if (typeof modelArchitectureMap === 'undefined') {
    window.modelArchitectureMap = {};
}

function listImageHistoryFolderAndFiles(path, isRefresh, callback, depth) {
    availableArchitectures.clear();
    let sortBy = localStorage.getItem('image_history_sort_by') ?? 'Name';
    let reverse = localStorage.getItem('image_history_sort_reverse') == 'true';
    let allowAnims = localStorage.getItem('image_history_allow_anims') != 'false';
    let sortElem = document.getElementById('image_history_sort_by');
    let sortReverseElem = document.getElementById('image_history_sort_reverse');
    let allowAnimsElem = document.getElementById('image_history_allow_anims');
    let fix = null;
    if (sortElem) {
        sortBy = sortElem.value;
        reverse = sortReverseElem.checked;
        allowAnims = allowAnimsElem.checked;
    }
    else { // first call happens before headers are built atm
        fix = () => {
            let sortElem = document.getElementById('image_history_sort_by');
            let sortReverseElem = document.getElementById('image_history_sort_reverse');
            let allowAnimsElem = document.getElementById('image_history_allow_anims');
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
            allowAnimsElem.addEventListener('change', () => {
                localStorage.setItem('image_history_allow_anims', allowAnimsElem.checked);
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
            return { 'name': fullSrc, 'data': { 'src': `${getImageOutPrefix()}/${fullSrc}`, 'fullsrc': fullSrc, 'name': f.src, 'metadata': interpretMetadata(f.metadata) } };
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
            label: (metadata && JSON.parse(metadata).is_starred) ? 'Unstar' : 'Star',
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
                copyText(metadata);
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
        href: escapeHtmlForUrl(src),
        is_download: true
    });
    if (permissions.hasPermission('user_delete_image') && !isDataImage) {
        buttons.push({
            label: 'Delete',
            title: 'Deletes this image from the server.',
            onclick: (e) => {
                if (!uiImprover.lastShift && getUserSetting('ui.checkifsurebeforedelete', true) && !confirm('Are you sure you want to delete this image?\nHold shift to bypass.')) {
                    return;
                }
                genericRequest('DeleteImage', {'path': fullsrc}, data => {
                    if (e) {
                        e.remove();
                    }
                    let historySection = getRequiredElementById('imagehistorybrowser-content');
                    let div = historySection.querySelector(`.image-block[data-name="${fullsrc}"]`);
                    if (div) {
                        div.remove();
                    }
                    div = historySection.querySelector(`.image-block[data-name="${src}"]`);
                    if (div) {
                        div.remove();
                    }
                    div = getRequiredElementById('current_image_batch').querySelector(`.image-block[data-src="${src}"]`);
                    if (div) {
                        div.remove();
                    }
                    let currentImage = document.getElementById('current_image_img');
                    if (currentImage && currentImage.dataset.src == src) {
                        forceShowWelcomeMessage();
                    }
                    imageFullView.close();
                });
            }
        });
    }
    return buttons;
}

function parseSearchQuery(query) {
    const namespaces = ['lora', 'prompt', 'model', 'controlnet', 'seed', 'steps', 'cfgscale', 'aspectratio', 'width', 'height', 'sampler', 'videoframes', 'fps', 'date'];
    const parts = [];
    let remaining = query.toLowerCase();
    
    while (remaining.length > 0) {
        let matched = false;
        for (let ns of namespaces) {
            if (remaining.startsWith(ns + ':')) {
                const afterColon = remaining.substring(ns.length + 1);
                let value = '';
                let inQuotes = false;
                let i = 0;
                
                for (; i < afterColon.length; i++) {
                    const char = afterColon[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (!inQuotes && char === ' ') {
                        break;
                    } else {
                        value += char;
                    }
                }
                
                parts.push({ type: 'namespace', namespace: ns, value: value.trim() });
                remaining = afterColon.substring(i).trim();
                matched = true;
                break;
            }
        }
        
        if (!matched) {
            const spaceIndex = remaining.indexOf(' ');
            if (spaceIndex === -1) {
                if (remaining.length > 0) {
                    parts.push({ type: 'text', value: remaining });
                }
                break;
            } else {
                parts.push({ type: 'text', value: remaining.substring(0, spaceIndex) });
                remaining = remaining.substring(spaceIndex + 1).trim();
            }
        }
    }
    
    return parts;
}

function matchesNamespaceSearch(parsedMeta, namespace, searchValue) {
    const params = parsedMeta.sui_image_params || {};
    
    switch(namespace) {
        case 'prompt':
            return (params.prompt || '').toLowerCase().includes(searchValue);
        
        case 'lora': {
            const promptLoras = [];
            const prompt = (params.prompt || '').toLowerCase();
            const loraMatches = prompt.matchAll(/<lora:([^:>]+):[^>]+>/g);
            for (const match of loraMatches) {
                promptLoras.push(match[1].toLowerCase());
            }
            
            const loraHashes = params.lorahashesinprompt || [];
            const loraNames = params.loranamesinprompt || [];
            const allLoras = [...promptLoras, ...loraHashes, ...loraNames].map(l => l.toLowerCase());
            
            if (parsedMeta.sui_models) {
                for (const model of parsedMeta.sui_models) {
                    if (model.param === 'lora' && model.name) {
                        allLoras.push(model.name.toLowerCase());
                    }
                }
            }
            
            return allLoras.some(lora => lora.includes(searchValue));
        }
        
        case 'model':
            return (params.model || '').toLowerCase().includes(searchValue);
        
        case 'controlnet': {
            const controlnets = params.controlnets || [];
            const cnFound = controlnets.some(cn => (cn.model || '').toLowerCase().includes(searchValue));
            
            if (!cnFound && parsedMeta.sui_models) {
                for (const model of parsedMeta.sui_models) {
                    if (model.param === 'controlnet' && model.name) {
                        if (model.name.toLowerCase().includes(searchValue)) {
                            return true;
                        }
                    }
                }
            }
            
            return cnFound;
        }
        
        case 'seed': {
            const seedValue = params.seed;
            if (seedValue === undefined || seedValue === null) return false;
            
            if (searchValue.startsWith('>')) {
                return parseInt(seedValue) > parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('<')) {
                return parseInt(seedValue) < parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('=')) {
                return seedValue.toString() === searchValue.substring(1).trim();
            } else {
                return seedValue.toString().includes(searchValue);
            }
        }
        
        case 'steps': {
            const stepsValue = params.steps;
            if (stepsValue === undefined || stepsValue === null) return false;
            
            if (searchValue.startsWith('>')) {
                return parseInt(stepsValue) > parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('<')) {
                return parseInt(stepsValue) < parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('=')) {
                return stepsValue.toString() === searchValue.substring(1).trim();
            } else {
                return stepsValue.toString() === searchValue;
            }
        }
        
        case 'cfgscale': {
            const cfgValue = params.cfgscale;
            if (cfgValue === undefined || cfgValue === null) return false;
            
            if (searchValue.startsWith('>')) {
                return parseFloat(cfgValue) > parseFloat(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('<')) {
                return parseFloat(cfgValue) < parseFloat(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('=')) {
                return parseFloat(cfgValue) === parseFloat(searchValue.substring(1).trim());
            } else {
                return cfgValue.toString() === searchValue;
            }
        }
        
        case 'aspectratio':
            return (params.aspectratio || '').toLowerCase().includes(searchValue);
        
        case 'width': {
            const widthValue = params.width;
            if (widthValue === undefined || widthValue === null) return false;
            
            if (searchValue.startsWith('>')) {
                return parseInt(widthValue) > parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('<')) {
                return parseInt(widthValue) < parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('=')) {
                return widthValue.toString() === searchValue.substring(1).trim();
            } else {
                return widthValue.toString() === searchValue;
            }
        }
        
        case 'height': {
            const heightValue = params.height;
            if (heightValue === undefined || heightValue === null) return false;
            
            if (searchValue.startsWith('>')) {
                return parseInt(heightValue) > parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('<')) {
                return parseInt(heightValue) < parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('=')) {
                return heightValue.toString() === searchValue.substring(1).trim();
            } else {
                return heightValue.toString() === searchValue;
            }
        }
        
        case 'sampler':
            return (params.sampler || '').toLowerCase().includes(searchValue);
        
        case 'videoframes': {
            const framesValue = params.videoframes;
            if (framesValue === undefined || framesValue === null) return false;
            
            if (searchValue.startsWith('>')) {
                return parseInt(framesValue) > parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('<')) {
                return parseInt(framesValue) < parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('=')) {
                return framesValue.toString() === searchValue.substring(1).trim();
            } else {
                return framesValue.toString() === searchValue;
            }
        }
        
        case 'fps': {
            const fpsValue = params.videofps;
            if (fpsValue === undefined || fpsValue === null) return false;
            
            if (searchValue.startsWith('>')) {
                return parseInt(fpsValue) > parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('<')) {
                return parseInt(fpsValue) < parseInt(searchValue.substring(1).trim());
            } else if (searchValue.startsWith('=')) {
                return fpsValue.toString() === searchValue.substring(1).trim();
            } else {
                return fpsValue.toString() === searchValue;
            }
        }
        
        case 'date': {
            const dateStr = parsedMeta.sui_extra_data?.date || params.date || parsedMeta.date || '';
            if (!dateStr) return false;
            
            const fileDate = dateStr.replace(/-/g, '.');
            const [fileYear, fileMonth] = fileDate.split('.');
            const fileYearMonth = `${fileYear}.${fileMonth}`;
            
            if (searchValue.startsWith('>')) {
                const compareDate = searchValue.substring(1).trim().replace(/-/g, '.');
                return fileDate > compareDate;
            } else if (searchValue.startsWith('<')) {
                const compareDate = searchValue.substring(1).trim().replace(/-/g, '.');
                return fileDate < compareDate;
            } else if (searchValue.startsWith('=')) {
                const compareDate = searchValue.substring(1).trim().replace(/-/g, '.');
                return fileDate === compareDate || fileYear === compareDate || fileYearMonth === compareDate;
            } else {
                const searchDate = searchValue.replace(/-/g, '.');
                return fileDate.includes(searchDate) || fileYear === searchDate || fileYearMonth === searchDate;
            }
        }
        
        default:
            return false;
    }
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
    
    parsedMeta.originalFilename = image.data.name;
    
    let fullModelName = null;
    if (parsedMeta.sui_models) {
        const mainModel = parsedMeta.sui_models.find(m => m.param === 'model');
        if (mainModel && mainModel.name) {
            fullModelName = mainModel.name;
        }
    }
    
    if (!fullModelName) {
        const shortName = parsedMeta.sui_image_params?.model || parsedMeta.model || null;
        if (shortName) {
            fullModelName = shortName.includes('.') ? shortName : shortName + '.safetensors';
        }
    }
    
    let groupedArch = null;
    if (fullModelName && typeof modelArchitectureMap !== 'undefined') {
        groupedArch = modelArchitectureMap[fullModelName];
        
        if (!groupedArch && fullModelName.includes('/')) {
            const filename = fullModelName.split('/').pop();
            groupedArch = modelArchitectureMap[filename];
            
            if (!groupedArch) {
                for (let modelKey in modelArchitectureMap) {
                    if (modelKey.endsWith('/' + filename) || modelKey === filename) {
                        groupedArch = modelArchitectureMap[modelKey];
                        break;
                    }
                }
            }
        }
        
        if (!groupedArch && !fullModelName.includes('.')) {
            const modelNameWithExt = fullModelName + '.safetensors';
            groupedArch = modelArchitectureMap[modelNameWithExt];
        }
        
        if (!groupedArch) {
            groupedArch = 'Unknown';
        }
    }
    
    if (groupedArch) {
        availableArchitectures.add(groupedArch);
    }
    
    if (architectureFilterState !== 'all' && architectureFilterState !== groupedArch) {
        return null;
    }
    
    if (mediaTypeFilterState !== 'all') {
        const filename = image.data.name || image.data.fullsrc || '';
        const ext = filename.split('.').pop().toLowerCase();
        const frames = parsedMeta.sui_image_params?.videoframes || 1;
        
        const isVideo = isVideoExt(filename) || 
                       (ext === 'gif' && frames > 1) || 
                       (ext === 'webp' && frames > 1);
        
        if (mediaTypeFilterState === 'videos' && !isVideo) return null;
        if (mediaTypeFilterState === 'images' && isVideo) return null;
    }
    
    if (orientationFilterState !== 'all' && parsedMeta.sui_image_params?.width && parsedMeta.sui_image_params?.height) {
        const width = parsedMeta.sui_image_params.width;
        const height = parsedMeta.sui_image_params.height;
        const aspectRatio = width / height;
        
        if (orientationFilterState === 'portrait' && aspectRatio >= 1) return null;
        if (orientationFilterState === 'landscape' && aspectRatio <= 1) return null;
        if (orientationFilterState === 'square') {
            const tolerance = 0.15;
            if (Math.abs(aspectRatio - 1) > tolerance) return null;
        }
    }
    
    let formattedMetadata = formatMetadata(image.data.metadata);
    let description = image.data.name + "\n" + formattedMetadata;
    let name = image.data.name;
    let allowAnims = localStorage.getItem('image_history_allow_anims') != 'false';
    let allowAnimToggle = allowAnims ? '' : '&noanim=true';
    let dragImage = image.data.src.endsWith('.html') ? 'imgs/html.jpg' : `${image.data.src}`;
    let imageSrc = image.data.src.endsWith('.html') ? 'imgs/html.jpg' : `${image.data.src}?preview=true${allowAnimToggle}`;
    let searchable = `${image.data.name}, ${image.data.metadata}, ${image.data.fullsrc}`;
    let detail_list = [escapeHtml(image.data.name), formattedMetadata.replaceAll('<br>', '&emsp;')];
    let aspectRatio = parsedMeta.sui_image_params?.width && parsedMeta.sui_image_params?.height ? parsedMeta.sui_image_params.width / parsedMeta.sui_image_params.height : null;
    return { name, description, buttons, 'image': imageSrc, 'dragimage': dragImage, className: parsedMeta.is_starred ? 'image-block-starred' : '', searchable, display: name, detail_list, aspectRatio, parsedMeta };
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

let orientationFilterState = localStorage.getItem('image_history_orientation_filter') || 'all';
let mediaTypeFilterState = localStorage.getItem('image_history_media_type_filter') || 'all';
let architectureFilterState = localStorage.getItem('image_history_architecture_filter') || 'all';
let availableArchitectures = new Set();

function getArchitectureDropdown() {
    let options = ['<option value="all">All</option>'];
    
    const allArchitectures = new Set();
    if (typeof modelArchitectureMap !== 'undefined') {
        for (let model in modelArchitectureMap) {
            const arch = modelArchitectureMap[model];
            if (arch && arch !== 'Unknown') {
                allArchitectures.add(arch);
            }
        }
    }
    
    for (let arch of availableArchitectures) {
        if (arch && arch !== 'Unknown') {
            allArchitectures.add(arch);
        }
    }
    
    const sortedArchs = Array.from(allArchitectures).sort();
    for (let arch of sortedArchs) {
        const selected = arch === architectureFilterState ? ' selected' : '';
        options.push(`<option value="${escapeHtml(arch)}"${selected}>${escapeHtml(arch)}</option>`);
    }
    
    if (typeof modelArchitectureMap !== 'undefined' && Object.values(modelArchitectureMap).includes('Unknown')) {
        const selected = 'Unknown' === architectureFilterState ? ' selected' : '';
        options.push(`<option value="Unknown"${selected}>Unknown</option>`);
    }
    
    return `<label for="image_history_arch_filter">Arch:</label> <select id="image_history_arch_filter" onchange="setArchitectureFilter(this.value)" style="margin-right: 8px;">${options.join('')}</select>`;
}

function setArchitectureFilter(arch) {
    architectureFilterState = arch;
    localStorage.setItem('image_history_architecture_filter', arch);
    imageHistoryBrowser.update();
}

function getOrientationFilterButtons() {
    const portraitSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="2" width="10" height="16" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>';
    const landscapeSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="5" width="16" height="10" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>';
    const squareSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="3" width="14" height="14" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>';
    const imageSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="5" width="14" height="10" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="7" cy="9" r="1.5" fill="currentColor"/><path d="M3 13l4-3 3 2 7-5" stroke="currentColor" fill="none" stroke-width="1.2"/></svg>';
    const videoSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="5" width="12" height="10" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M14 10l5-3v6z" fill="currentColor"/></svg>';
    
    return `<button id="orientation_portrait" class="orientation-filter-btn basic-button" title="Portrait" onclick="setOrientationFilter('portrait')" style="padding: 2px 6px; margin-right: 4px;">${portraitSvg}</button>`
        + `<button id="orientation_landscape" class="orientation-filter-btn basic-button" title="Landscape" onclick="setOrientationFilter('landscape')" style="padding: 2px 6px; margin-right: 4px;">${landscapeSvg}</button>`
        + `<button id="orientation_square" class="orientation-filter-btn basic-button" title="Square" onclick="setOrientationFilter('square')" style="padding: 2px 6px; margin-right: 8px;">${squareSvg}</button>`
        + `<span style="border-left: 1px solid #666; margin: 0 8px; padding: 0; height: 20px; display: inline-block; vertical-align: middle;"></span>`
        + `<button id="media_images" class="media-filter-btn basic-button" title="Images" onclick="setMediaTypeFilter('images')" style="padding: 2px 6px; margin-right: 4px;">${imageSvg}</button>`
        + `<button id="media_videos" class="media-filter-btn basic-button" title="Videos" onclick="setMediaTypeFilter('videos')" style="padding: 2px 6px; margin-right: 8px;">${videoSvg}</button>`;
}

function setOrientationFilter(orientation) {
    orientationFilterState = orientationFilterState === orientation ? 'all' : orientation;
    localStorage.setItem('image_history_orientation_filter', orientationFilterState);
    updateFilterButtons();
    imageHistoryBrowser.update();
}

function setMediaTypeFilter(mediaType) {
    mediaTypeFilterState = mediaTypeFilterState === mediaType ? 'all' : mediaType;
    localStorage.setItem('image_history_media_type_filter', mediaTypeFilterState);
    updateFilterButtons();
    imageHistoryBrowser.update();
}

function updateFilterButtons() {
    document.querySelectorAll('.orientation-filter-btn').forEach(btn => {
        btn.style.opacity = '0.5';
    });
    if (orientationFilterState !== 'all') {
        const activeBtn = document.getElementById(`orientation_${orientationFilterState}`);
        if (activeBtn) activeBtn.style.opacity = '1';
    }
    
    document.querySelectorAll('.media-filter-btn').forEach(btn => {
        btn.style.opacity = '0.5';
    });
    if (mediaTypeFilterState !== 'all') {
        const activeBtn = document.getElementById(`media_${mediaTypeFilterState}`);
        if (activeBtn) activeBtn.style.opacity = '1';
    }
}

let imageHistoryBrowser = new GenPageBrowserClass('image_history', listImageHistoryFolderAndFiles, 'imagehistorybrowser', 'Thumbnails', describeImage, selectImageInHistory,
    '<span id="arch_dropdown_container"></span>' + getOrientationFilterButtons() + `<label for="image_history_sort_by">Sort:</label> <select id="image_history_sort_by"><option>Name</option><option>Date</option></select> <input type="checkbox" id="image_history_sort_reverse"> <label for="image_history_sort_reverse">Reverse</label> &emsp; <input type="checkbox" id="image_history_allow_anims" checked autocomplete="off"> <label for="image_history_allow_anims">Allow Animation</label>`);

setTimeout(() => {
    updateFilterButtons();
    updateArchitectureDropdown();
}, 100);

function updateArchitectureDropdown() {
    setTimeout(() => {
        const container = document.getElementById('arch_dropdown_container');
        if (container) {
            container.innerHTML = getArchitectureDropdown();
        }
    }, 500);
}

imageHistoryBrowser.builtEvent = updateArchitectureDropdown;

function storeImageToHistoryWithCurrentParams(img) {
    let data = getGenInput();
    data['image'] = img;
    delete data['initimage'];
    delete data['maskimage'];
    genericRequest('AddImageToHistory', data, res => {
        mainGenHandler.gotImageResult(res.images[0].image, res.images[0].metadata, '0');
    });
}
