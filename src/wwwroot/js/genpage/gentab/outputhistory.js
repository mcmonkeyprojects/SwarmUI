let imageHistorySelected = new Set();
let imageHistoryBulkDeleteRunning = false;

function getImageHistoryEntries() {
    let historySection = document.getElementById('imagehistorybrowser-content');
    if (!historySection) {
        return [];
    }
    return Array.from(historySection.children).filter(c => c.dataset?.name);
}

function pruneImageHistorySelectionToCurrentFiles() {
    if (!imageHistoryBrowser?.lastFiles) {
        return;
    }
    let currentFiles = new Set(imageHistoryBrowser.lastFiles.map(f => f.name));
    for (let path of imageHistorySelected) {
        if (!currentFiles.has(path)) {
            imageHistorySelected.delete(path);
        }
    }
}

function updateImageHistoryBulkControls() {
    let controls = document.getElementById('image_history_bulk_controls');
    if (!controls) {
        return;
    }
    let canDelete = permissions.hasPermission('user_delete_image');
    controls.style.display = canDelete ? '' : 'none';
    if (!canDelete) {
        return;
    }
    let count = imageHistorySelected.size;
    let countElem = document.getElementById('image_history_selected_count');
    if (countElem) {
        countElem.innerText = `${count} selected`;
    }
    let selectAllButton = document.getElementById('image_history_select_all');
    let clearButton = document.getElementById('image_history_clear_selection');
    let deleteButton = document.getElementById('image_history_delete_selected');
    let anyEntries = getImageHistoryEntries().length > 0;
    if (selectAllButton) {
        selectAllButton.disabled = !anyEntries || imageHistoryBulkDeleteRunning;
    }
    if (clearButton) {
        clearButton.disabled = count == 0 || imageHistoryBulkDeleteRunning;
    }
    if (deleteButton) {
        deleteButton.disabled = count == 0 || imageHistoryBulkDeleteRunning;
    }
}

function setImageHistorySelection(fullsrc, isSelected, entry = null) {
    if (isSelected) {
        imageHistorySelected.add(fullsrc);
    }
    else {
        imageHistorySelected.delete(fullsrc);
    }
    if (!entry) {
        entry = getImageHistoryEntries().find(e => e.dataset.name == fullsrc);
    }
    if (entry) {
        entry.classList.toggle('browser-entry-selected', isSelected);
        let checkbox = entry.querySelector('.browser-entry-checkbox');
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    }
    updateImageHistoryBulkControls();
}

function clearImageHistorySelection() {
    imageHistorySelected.clear();
    for (let entry of getImageHistoryEntries()) {
        entry.classList.remove('browser-entry-selected');
        let checkbox = entry.querySelector('.browser-entry-checkbox');
        if (checkbox) {
            checkbox.checked = false;
        }
    }
    updateImageHistoryBulkControls();
}

function ensureImageHistoryBulkControlsReady() {
    let controls = document.getElementById('image_history_bulk_controls');
    if (!controls || controls.dataset.ready) {
        updateImageHistoryBulkControls();
        return;
    }
    controls.dataset.ready = 'true';
    getRequiredElementById('image_history_select_all').addEventListener('click', () => {
        for (let entry of getImageHistoryEntries()) {
            setImageHistorySelection(entry.dataset.name, true, entry);
        }
        updateImageHistoryBulkControls();
    });
    getRequiredElementById('image_history_clear_selection').addEventListener('click', () => {
        clearImageHistorySelection();
    });
    getRequiredElementById('image_history_delete_selected').addEventListener('click', () => {
        deleteSelectedHistoryImages();
    });
    updateImageHistoryBulkControls();
}

function removeImageFromHistoryUI(fullsrc, src, explicitEntry = null) {
    imageHistorySelected.delete(fullsrc);
    let historySection = document.getElementById('imagehistorybrowser-content');
    if (historySection) {
        let entry = explicitEntry || getImageHistoryEntries().find(e => e.dataset.name == fullsrc || e.dataset.name == src);
        if (entry) {
            entry.remove();
        }
    }
    let currentImage = currentImageHelper.getCurrentImage();
    if (currentImage && currentImage.dataset.src == src) {
        setCurrentImage(null);
    }
    let currentBatch = document.getElementById('current_image_batch');
    if (currentBatch) {
        let batchEntry = Array.from(currentBatch.children).find(e => e.dataset?.src == src);
        if (batchEntry) {
            removeImageBlockFromBatch(batchEntry);
        }
    }
    updateImageHistoryBulkControls();
}

function deleteSingleHistoryImage(fullsrc, src, explicitEntry = null, errorHandle = null) {
    return new Promise(resolve => {
        let onSuccess = () => {
            removeImageFromHistoryUI(fullsrc, src, explicitEntry);
            resolve({ success: true });
        };
        genericRequest('DeleteImage', { 'path': fullsrc }, onSuccess, 0, error => {
            if (errorHandle) {
                errorHandle(error);
            }
            else {
                showError(error);
            }
            resolve({ success: false, error });
        });
    });
}

async function deleteSelectedHistoryImages() {
    if (imageHistoryBulkDeleteRunning) {
        return;
    }
    let selected = [...imageHistorySelected];
    if (selected.length == 0) {
        return;
    }
    let imgWord = selected.length == 1 ? 'image' : 'images';
    if (!uiImprover.lastShift && getUserSetting('ui.checkifsurebeforedelete', true) && !confirm(`Are you sure you want to delete ${selected.length} ${imgWord}?\nHold shift to bypass.`)) {
        return;
    }
    imageHistoryBulkDeleteRunning = true;
    updateImageHistoryBulkControls();
    let deleted = 0;
    let failed = 0;
    for (let fullsrc of selected) {
        let src = `${getImageOutPrefix()}/${fullsrc}`;
        let res = await deleteSingleHistoryImage(fullsrc, src, null, () => {});
        if (res.success) {
            deleted++;
        }
        else {
            failed++;
            console.log(`Failed to delete image '${fullsrc}': ${res.error}`);
        }
    }
    imageHistoryBulkDeleteRunning = false;
    updateImageHistoryBulkControls();
    if (deleted > 0) {
        imageHistoryBrowser.lightRefresh();
    }
    if (failed > 0) {
        showError(`Deleted ${deleted} image(s). Failed to delete ${failed} image(s).`);
    }
    else if (deleted > 0) {
        doNoticePopover(`Deleted ${deleted} image${deleted == 1 ? '' : 's'}.`, 'notice-pop-green');
    }
}

function listOutputHistoryFolderAndFiles(path, isRefresh, callback, depth) {
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
        ensureImageHistoryBulkControlsReady();
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
                imageHistoryBrowser.lightRefresh();
            });
            sortReverseElem.addEventListener('change', () => {
                localStorage.setItem('image_history_sort_reverse', sortReverseElem.checked);
                imageHistoryBrowser.lightRefresh();
            });
            allowAnimsElem.addEventListener('change', () => {
                localStorage.setItem('image_history_allow_anims', allowAnimsElem.checked);
                imageHistoryBrowser.lightRefresh();
            });
            ensureImageHistoryBulkControlsReady();
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
    let buttons = [];
    if (permissions.hasPermission('user_star_images') && !isDataImage) {
        buttons.push({
            label: (metadata && JSON.parse(metadata).is_starred) ? 'Unstar' : 'Star',
            title: 'Star or unstar this image - starred images get moved to a separate folder and highlighted.',
            className: (metadata && JSON.parse(metadata).is_starred) ? ' star-button button-starred-image' : ' star-button',
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
                let deleteBehavior = getUserSetting('ui.deleteimagebehavior', 'next');
                let shifted = deleteBehavior == 'nothing' ? false : shiftToNextImagePreview(deleteBehavior == 'next', imageFullView.isOpen());
                if (!shifted) {
                    imageFullView.close();
                }
                deleteSingleHistoryImage(fullsrc, src, e);
            }
        });
    }
    return buttons;
}

function describeOutputFile(image) {
    let buttons = buttonsForImage(image.data.fullsrc, image.data.src, image.data.metadata);
    let canDelete = permissions.hasPermission('user_delete_image') && !image.data.src.startsWith('data:');
    let isSelected = imageHistorySelected.has(image.data.fullsrc);
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
    let allowAnims = localStorage.getItem('image_history_allow_anims') != 'false';
    let allowAnimToggle = allowAnims ? '' : '&noanim=true';
    let forceImage = null, forcePreview = null;
    let extension = image.data.src.split('.').pop();
    if (extension == 'html') {
        forceImage = 'imgs/html.jpg';
        forcePreview = forceImage;
    }
    else if (['wav', 'mp3', 'aac', 'ogg', 'flac'].includes(extension)) {
        forcePreview = 'imgs/audio_placeholder.jpg';
    }
    let dragImage = forceImage ?? `${image.data.src}`;
    let imageSrc = forcePreview ?? `${image.data.src}?preview=true${allowAnimToggle}`;
    let searchable = `${image.data.name}, ${image.data.metadata}, ${image.data.fullsrc}`;
    let detail_list = [escapeHtml(image.data.name), formattedMetadata.replaceAll('<br>', '&emsp;')];
    let aspectRatio = parsedMeta.sui_image_params?.width && parsedMeta.sui_image_params?.height ? parsedMeta.sui_image_params.width / parsedMeta.sui_image_params.height : null;
    let className = parsedMeta.is_starred ? 'image-block-starred' : '';
    if (isSelected) {
        className = `${className} browser-entry-selected`.trim();
    }
    let checkbox = canDelete ? {
        checked: isSelected,
        title: 'Select image',
        onchange: (checked, file, div) => {
            setImageHistorySelection(image.data.fullsrc, checked, div);
        }
    } : null;
    return { name, description, buttons, checkbox, 'image': imageSrc, 'dragimage': dragImage, className, searchable, display: name, detail_list, aspectRatio };
}

function selectOutputInHistory(image, div) {
    lastHistoryImage = image.data.src;
    lastHistoryImageDiv = div;
    let curImg = currentImageHelper.getCurrentImage();
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

let imageHistoryBrowser = new GenPageBrowserClass('image_history', listOutputHistoryFolderAndFiles, 'imagehistorybrowser', 'Thumbnails', describeOutputFile, selectOutputInHistory,
    `<label for="image_history_sort_by">Sort:</label> <select id="image_history_sort_by"><option>Name</option><option>Date</option></select> <input type="checkbox" id="image_history_sort_reverse"> <label for="image_history_sort_reverse">Reverse</label> &emsp; <input type="checkbox" id="image_history_allow_anims" checked autocomplete="off"> <label for="image_history_allow_anims">Allow Animation</label> <span id="image_history_bulk_controls" class="image-history-bulk-controls"><span id="image_history_selected_count" class="image-history-selected-count">0 selected</span> <button id="image_history_select_all" class="refresh-button">Select All</button> <button id="image_history_clear_selection" class="refresh-button">Clear</button> <button id="image_history_delete_selected" class="interrupt-button">Delete Selected</button></span>`);
imageHistoryBrowser.folderSelectedEvent = () => {
    clearImageHistorySelection();
};
imageHistoryBrowser.builtEvent = () => {
    pruneImageHistorySelectionToCurrentFiles();
    updateImageHistoryBulkControls();
};

function storeImageToHistoryWithCurrentParams(img) {
    let data = getGenInput();
    data['image'] = img;
    delete data['initimage'];
    delete data['maskimage'];
    genericRequest('AddImageToHistory', data, res => {
        mainGenHandler.gotImageResult(res.images[0].image, res.images[0].metadata, '0');
    });
}
