
function listImageHistoryFolderAndFiles(path, isRefresh, callback, depth) {
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
    let allowAnims = localStorage.getItem('image_history_allow_anims') != 'false';
    let allowAnimToggle = allowAnims ? '' : '&noanim=true';
    let dragImage = image.data.src.endsWith('.html') ? 'imgs/html.jpg' : `${image.data.src}`;
    let imageSrc = image.data.src.endsWith('.html') ? 'imgs/html.jpg' : `${image.data.src}?preview=true${allowAnimToggle}`;
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
    `<label for="image_history_sort_by">Sort:</label> <select id="image_history_sort_by"><option>Name</option><option>Date</option></select> <input type="checkbox" id="image_history_sort_reverse"> <label for="image_history_sort_reverse">Reverse</label> &emsp; <input type="checkbox" id="image_history_allow_anims" checked autocomplete="off"> <label for="image_history_allow_anims">Allow Animation</label>`);

function storeImageToHistoryWithCurrentParams(img) {
    let data = getGenInput();
    data['image'] = img;
    delete data['initimage'];
    delete data['maskimage'];
    genericRequest('AddImageToHistory', data, res => {
        mainGenHandler.gotImageResult(res.images[0].image, res.images[0].metadata, '0');
    });
}
