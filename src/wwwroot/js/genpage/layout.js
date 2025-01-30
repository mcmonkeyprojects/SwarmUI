
let pageBarTop = -1;
let pageBarTop2 = -1;
let pageBarMid = -1;
let imageEditorSizeBarVal = -1;
let midForceToBottom = localStorage.getItem('barspot_midForceToBottom') == 'true';
let leftShut = localStorage.getItem('barspot_leftShut') == 'true';

let setPageBarsFunc;
let altPromptSizeHandleFunc;

let layoutResets = [];

function resetPageSizer() {
    for (let localStore of Object.keys(localStorage).filter(k => k.startsWith('barspot_'))) {
        localStorage.removeItem(localStore);
    }
    pageBarTop = -1;
    pageBarTop2 = -1;
    pageBarMid = -1;
    imageEditorSizeBarVal = -1;
    midForceToBottom = false;
    leftShut = false;
    setPageBarsFunc();
    for (let runnable of layoutResets) {
        runnable();
    }
}

function pageSizer() {
    let topSplit = getRequiredElementById('t2i-top-split-bar');
    let topSplit2 = getRequiredElementById('t2i-top-2nd-split-bar');
    let midSplit = getRequiredElementById('t2i-mid-split-bar');
    let topBar = getRequiredElementById('t2i_top_bar');
    let bottomInfoBar = getRequiredElementById('bottom_info_bar');
    let bottomBarContent = getRequiredElementById('t2i_bottom_bar_content');
    let inputSidebar = getRequiredElementById('input_sidebar');
    let mainInputsAreaWrapper = getRequiredElementById('main_inputs_area_wrapper');
    let mainImageArea = getRequiredElementById('main_image_area');
    let currentImage = getRequiredElementById('current_image');
    let currentImageBatch = getRequiredElementById('current_image_batch_wrapper');
    let currentImageBatchCore = getRequiredElementById('current_image_batch');
    let midSplitButton = getRequiredElementById('t2i-mid-split-quickbutton');
    let topSplitButton = getRequiredElementById('t2i-top-split-quickbutton');
    let altRegion = getRequiredElementById('alt_prompt_region');
    let altText = getRequiredElementById('alt_prompt_textbox');
    let altNegText = getRequiredElementById('alt_negativeprompt_textbox');
    let altImageRegion = getRequiredElementById('alt_prompt_extra_area');
    let editorSizebar = getRequiredElementById('image_editor_sizebar');
    let topDrag = false;
    let topDrag2 = false;
    let midDrag = false;
    let imageEditorSizeBarDrag = false;
    let isSmallWindow = window.innerWidth < 768 || window.innerHeight < 768;
    function setPageBars() {
        tweakNegativePromptBox();
        if (altRegion.style.display != 'none') {
            dynamicSizeTextBox(altText);
            dynamicSizeTextBox(altNegText);
            altRegion.style.top = `calc(-${altText.offsetHeight + altNegText.offsetHeight + altImageRegion.offsetHeight}px - 2rem)`;
        }
        setCookie('barspot_pageBarTop', pageBarTop, 365);
        setCookie('barspot_pageBarTop2', pageBarTop2, 365);
        setCookie('barspot_pageBarMidPx', pageBarMid, 365);
        setCookie('barspot_imageEditorSizeBar', imageEditorSizeBarVal, 365);
        let barTopLeft = leftShut ? `0px` : pageBarTop == -1 ? (isSmallWindow ? `14rem` : `28rem`) : `${pageBarTop}px`;
        let barTopRight = pageBarTop2 == -1 ? (isSmallWindow ? `4rem` : `21rem`) : `${pageBarTop2}px`;
        let curImgWidth = `100vw - ${barTopLeft} - ${barTopRight} - 10px`;
        // TODO: this 'eval()' hack to read the size in advance is a bit cursed.
        let fontRem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        let curImgWidthNum = eval(curImgWidth.replace(/vw/g, `* ${window.innerWidth * 0.01}`).replace(/rem/g, `* ${fontRem}`).replace(/px/g, ''));
        if (curImgWidthNum < 400) {
            barTopRight = `${barTopRight} + ${400 - curImgWidthNum}px`;
            curImgWidth = `100vw - ${barTopLeft} - ${barTopRight} - 10px`;
        }
        inputSidebar.style.width = `${barTopLeft}`;
        mainInputsAreaWrapper.classList[pageBarTop < 350 ? "add" : "remove"]("main_inputs_small");
        mainInputsAreaWrapper.style.width = `${barTopLeft}`;
        inputSidebar.style.display = leftShut ? 'none' : '';
        altRegion.style.width = `calc(100vw - ${barTopLeft} - ${barTopRight} - 10px)`;
        mainImageArea.style.width = `calc(100vw - ${barTopLeft})`;
        mainImageArea.scrollTop = 0;
        if (imageEditor.active) {
            let imageEditorSizePercent = imageEditorSizeBarVal < 0 ? 0.5 : (imageEditorSizeBarVal / 100.0);
            imageEditor.inputDiv.style.width = `calc((${curImgWidth}) * ${imageEditorSizePercent} - 3px)`;
            currentImage.style.width = `calc((${curImgWidth}) * ${(1.0 - imageEditorSizePercent)} - 3px)`;
        }
        else {
            currentImage.style.width = `calc(${curImgWidth})`;
        }
        currentImageBatch.style.width = `calc(${barTopRight} - 22px)`;
        if (currentImageBatchCore.offsetWidth < 425) {
            currentImageBatchCore.classList.add('current_image_batch_core_small');
        }
        else {
            currentImageBatchCore.classList.remove('current_image_batch_core_small');
        }
        topSplitButton.innerHTML = leftShut ? '&#x21DB;' : '&#x21DA;';
        midSplitButton.innerHTML = midForceToBottom ? '&#x290A;' : '&#x290B;';
        let altHeight = altRegion.style.display == 'none' ? '0px' : `(${altText.offsetHeight + altNegText.offsetHeight + altImageRegion.offsetHeight}px + 2rem)`;
        if (pageBarMid != -1 || midForceToBottom) {
            let fixed = midForceToBottom ? `6.5rem` : `${pageBarMid}px`;
            topSplit.style.height = `calc(100vh - ${fixed})`;
            topSplit2.style.height = `calc(100vh - ${fixed})`;
            inputSidebar.style.height = `calc(100vh - ${fixed})`;
            mainInputsAreaWrapper.style.height = `calc(100vh - ${fixed})`;
            mainImageArea.style.height = `calc(100vh - ${fixed})`;
            currentImage.style.height = `calc(100vh - ${fixed} - ${altHeight})`;
            imageEditor.inputDiv.style.height = `calc(100vh - ${fixed} - ${altHeight})`;
            editorSizebar.style.height = `calc(100vh - ${fixed} - ${altHeight})`;
            currentImageBatch.style.height = `calc(100vh - ${fixed})`;
            topBar.style.height = `calc(100vh - ${fixed})`;
            let bottomBarHeight = bottomInfoBar.offsetHeight;
            bottomBarContent.style.height = `calc(${fixed} - ${bottomBarHeight}px)`;
        }
        else {
            topSplit.style.height = '';
            topSplit2.style.height = '';
            inputSidebar.style.height = '';
            mainInputsAreaWrapper.style.height = '';
            mainImageArea.style.height = '';
            currentImage.style.height = `calc(49vh - ${altHeight})`;
            imageEditor.inputDiv.style.height = `calc(49vh - ${altHeight})`;
            editorSizebar.style.height = `calc(49vh - ${altHeight})`;
            currentImageBatch.style.height = '';
            topBar.style.height = '';
            bottomBarContent.style.height = '';
        }
        imageEditor.resize();
        alignImageDataFormat();
        imageHistoryBrowser.makeVisible(getRequiredElementById('t2i_bottom_bar'));
    }
    setPageBarsFunc = setPageBars;
    let cookieA = getCookie('barspot_pageBarTop');
    if (cookieA) {
        pageBarTop = parseInt(cookieA);
    }
    let cookieB = getCookie('barspot_pageBarTop2');
    if (cookieB) {
        pageBarTop2 = parseInt(cookieB);
    }
    let cookieC = getCookie('barspot_pageBarMidPx');
    if (cookieC) {
        pageBarMid = parseInt(cookieC);
    }
    let cookieD = getCookie('barspot_imageEditorSizeBar');
    if (cookieD) {
        imageEditorSizeBarVal = parseInt(cookieD);
    }
    setPageBars();
    topSplit.addEventListener('mousedown', (e) => {
        topDrag = true;
        e.preventDefault();
    }, true);
    topSplit2.addEventListener('mousedown', (e) => {
        topDrag2 = true;
        e.preventDefault();
    }, true);
    topSplit.addEventListener('touchstart', (e) => {
        topDrag = true;
        e.preventDefault();
    }, true);
    topSplit2.addEventListener('touchstart', (e) => {
        topDrag2 = true;
        e.preventDefault();
    }, true);
    editorSizebar.addEventListener('mousedown', (e) => {
        imageEditorSizeBarDrag = true;
        e.preventDefault();
    }, true);
    editorSizebar.addEventListener('touchstart', (e) => {
        imageEditorSizeBarDrag = true;
        e.preventDefault();
    }, true);
    function setMidForce(val) {
        midForceToBottom = val;
        localStorage.setItem('barspot_midForceToBottom', midForceToBottom);
    }
    function setLeftShut(val) {
        leftShut = val;
        localStorage.setItem('barspot_leftShut', leftShut);
    }
    midSplit.addEventListener('mousedown', (e) => {
        if (e.target == midSplitButton) {
            return;
        }
        midDrag = true;
        setMidForce(false);
        e.preventDefault();
    }, true);
    midSplit.addEventListener('touchstart', (e) => {
        if (e.target == midSplitButton) {
            return;
        }
        midDrag = true;
        setMidForce(false);
        e.preventDefault();
    }, true);
    midSplitButton.addEventListener('click', (e) => {
        midDrag = false;
        setMidForce(!midForceToBottom);
        pageBarMid = Math.max(pageBarMid, 400);
        setPageBars();
        e.preventDefault();
    }, true);
    topSplitButton.addEventListener('click', (e) => {
        topDrag = false;
        setLeftShut(!leftShut);
        pageBarTop = Math.max(pageBarTop, 400);
        setPageBars();
        e.preventDefault();
        triggerChangeFor(altText);
        triggerChangeFor(altNegText);
    }, true);
    let moveEvt = (e, x, y) => {
        let offX = x;
        offX = Math.min(Math.max(offX, 100), window.innerWidth - 10);
        if (topDrag) {
            pageBarTop = Math.min(offX - 5, 51 * 16);
            setLeftShut(pageBarTop < 300);
            setPageBars();
        }
        if (topDrag2) {
            pageBarTop2 = window.innerWidth - offX + 15;
            if (pageBarTop2 < 100) {
                pageBarTop2 = 22;
            }
            setPageBars();
        }
        if (imageEditorSizeBarDrag) {
            let maxAreaWidth = imageEditor.inputDiv.offsetWidth + currentImage.offsetWidth + 10;
            let imageAreaLeft = imageEditor.inputDiv.getBoundingClientRect().left;
            let val = Math.min(Math.max(offX - imageAreaLeft + 3, 200), maxAreaWidth - 200);
            imageEditorSizeBarVal = Math.min(90, Math.max(10, val / maxAreaWidth * 100));
            setPageBars();
        }
        if (midDrag) {
            const MID_OFF = 85;
            let refY = Math.min(Math.max(e.pageY, MID_OFF), window.innerHeight - MID_OFF);
            setMidForce(refY >= window.innerHeight - MID_OFF);
            pageBarMid = window.innerHeight - refY + topBar.getBoundingClientRect().top + 3;
            setPageBars();
        }
    };
    document.addEventListener('mousemove', (e) => moveEvt(e, e.pageX, e.pageY));
    document.addEventListener('touchmove', (e) => moveEvt(e, e.touches.item(0).pageX, e.touches.item(0).pageY));
    document.addEventListener('mouseup', (e) => {
        topDrag = false;
        topDrag2 = false;
        midDrag = false;
        imageEditorSizeBarDrag = false;
    });
    document.addEventListener('touchend', (e) => {
        topDrag = false;
        topDrag2 = false;
        midDrag = false;
        imageEditorSizeBarDrag = false;
    });
    for (let tab of getRequiredElementById('bottombartabcollection').getElementsByTagName('a')) {
        tab.addEventListener('click', (e) => {
            setMidForce(false);
            setPageBars();
        });
    }
    altText.addEventListener('keydown', (e) => {
        if (e.key == 'Enter' && !e.shiftKey) {
            altText.dispatchEvent(new Event('change'));
            getRequiredElementById('alt_generate_button').click();
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });
    altNegText.addEventListener('keydown', (e) => {
        if (e.key == 'Enter' && !e.shiftKey) {
            altNegText.dispatchEvent(new Event('change'));
            getRequiredElementById('alt_generate_button').click();
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });
    altText.addEventListener('input', (e) => {
        let inputPrompt = document.getElementById('input_prompt');
        if (inputPrompt) {
            inputPrompt.value = altText.value;
        }
        setCookie(`lastparam_input_prompt`, altText.value, getParamMemoryDays());
        textPromptDoCount(altText, getRequiredElementById('alt_text_tokencount'));
        monitorPromptChangeForEmbed(altText.value, 'positive');
        setGroupAdvancedOverride('regionalprompting', altText.value.includes('<segment:') || altText.value.includes('<region:'));
    });
    altText.addEventListener('input', () => {
        setCookie(`lastparam_input_prompt`, altText.value, getParamMemoryDays());
        setPageBars();
    });
    altNegText.addEventListener('input', (e) => {
        let inputNegPrompt = document.getElementById('input_negativeprompt');
        if (inputNegPrompt) {
            inputNegPrompt.value = altNegText.value;
        }
        setCookie(`lastparam_input_negativeprompt`, altNegText.value, getParamMemoryDays());
        let negTokCount = getRequiredElementById('alt_negtext_tokencount');
        if (altNegText.value == '') {
            negTokCount.style.display = 'none';
        }
        else {
            negTokCount.style.display = '';
        }
        textPromptDoCount(altNegText, negTokCount, ', Neg: ');
        monitorPromptChangeForEmbed(altNegText.value, 'negative');
    });
    altNegText.addEventListener('input', () => {
        setCookie(`lastparam_input_negativeprompt`, altNegText.value, getParamMemoryDays());
        setPageBars();
    });
    function altPromptSizeHandle() {
        altRegion.style.top = `calc(-${altText.offsetHeight + altNegText.offsetHeight + altImageRegion.offsetHeight}px - 2rem)`;
        setPageBars();
    }
    altPromptSizeHandle();
    new ResizeObserver(altPromptSizeHandle).observe(altText);
    new ResizeObserver(altPromptSizeHandle).observe(altNegText);
    altPromptSizeHandleFunc = altPromptSizeHandle;
    textPromptAddKeydownHandler(altText);
    textPromptAddKeydownHandler(altNegText);
    addEventListener("resize", setPageBars);
    textPromptAddKeydownHandler(getRequiredElementById('edit_wildcard_contents'));
}
