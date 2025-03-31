/** Data about a tab within the Generate UI that can be moved to different containers. */
class MovableGenTab {
    constructor(navLink, handler) {
        this.handler = handler;
        this.navElem = navLink;
        this.id = this.navElem.getAttribute('href').substring(1);
        this.contentElem = getRequiredElementById(this.id);
        this.title = this.navElem.innerText;
        this.defaultGroup = findParentOfClass(this.navElem, 'swarm-gen-tab-subnav');
        this.currentGroup = this.defaultGroup;
        this.targetGroupId = getCookie(`tabloc_${this.id}`) || this.defaultGroup.id;
        this.visible = true;
        this.navElem.removeAttribute('data-bs-toggle');
        this.navElem.addEventListener('click', this.clickOn.bind(this));
    }

    /** Alternate click handler for tabs, as bootstrap click handler gets confused. */
    clickOn(e) {
        e.preventDefault();
        this.setSelected();
        for (let tab of this.handler.managedTabs.filter(t => t.currentGroup.id == this.currentGroup.id && t.id != this.id)) {
            tab.setNotSelected();
        }
        setTimeout(() => {
            this.handler.reapplyPositions();
        }, 1);
    }

    /** Marks this tab as not selected, visually hiding it. */
    setNotSelected() {
        this.navElem.classList.remove('active');
        this.contentElem.classList.remove('active');
        this.contentElem.classList.remove('show');
    }

    /** Marks this tab as currently selected, visually hiding it. */
    setSelected() {
        this.navElem.classList.add('active');
        this.contentElem.classList.add('active');
        this.contentElem.classList.add('show');
    }

    /** Click a different entry in the current group, to deselect this. */
    clickOther() {
        let nextTab = this.navElem.parentElement.nextElementSibling || this.navElem.parentElement.previousElementSibling;
        if (nextTab) {
            nextTab.querySelector('.nav-link').click();
        }
    }

    /** Triggers an update, moving this to where it's meant to be. */
    update() {
        if (this.targetGroupId != this.currentGroup.id) {
            if (this.visible && this.navElem.classList.contains('active')) {
                this.clickOther();
                this.setNotSelected();
            }
            this.currentGroup = getRequiredElementById(this.targetGroupId);
            this.currentGroup.appendChild(this.navElem.parentElement);
            let newContentContainer = getRequiredElementById(this.currentGroup.dataset.content);
            newContentContainer.appendChild(this.contentElem);
            if (this.visible && [... this.currentGroup.querySelectorAll('.nav-link')].length == 1) {
                this.navElem.click();
            }
        }
        if (this.targetGroupId != this.defaultGroup.id) {
            setCookie(`tabloc_${this.id}`, this.targetGroupId, 365);
        }
        else {
            deleteCookie(`tabloc_${this.id}`);
        }
        if (!this.visible && this.navElem.classList.contains('active')) {
            this.clickOther();
            this.setNotSelected();
        }
        this.navElem.style.display = this.visible ? '' : 'none';
        this.contentElem.style.display = this.visible ? '' : 'none';
    }
}

/** Central handler for generate main tab layout logic. */
class GenTabLayout {

    /** List of functions to run when the layout is reset to default. This should remove any variables in browser storage related to layout. */
    layoutResets = [];
    
    /** Whether the left section should be shut. */
    leftShut = localStorage.getItem('barspot_leftShut') == 'true';

    /** Whether the bottom section should be shut. */
    bottomShut = localStorage.getItem('barspot_midForceToBottom') == 'true';

    /** Position of the image-editor alignment bar (the split between image editor and output area). -1 if unset. */
    imageEditorBarPos = parseInt(getCookie('barspot_imageEditorSizeBar') || '-1');
    
    /** Position of the left section bar. -1 if unset. */
    leftSectionBarPos = parseInt(getCookie('barspot_pageBarTop') || '-1');

    /** Position of the right section bar. -1 if unset. */
    rightSectionBarPos = parseInt(getCookie('barspot_pageBarTop2') || '-1');

    /** Position of the bottom section bar. -1 if unset. */
    bottomSectionBarPos = parseInt(getCookie('barspot_pageBarMidPx') || '-1');

    hideTabs = (getCookie('layout_hidetabs') || '').split(',');

    constructor() {
        this.leftSplitBar = getRequiredElementById('t2i-top-split-bar');
        this.rightSplitBar = getRequiredElementById('t2i-top-2nd-split-bar');
        this.leftSplitBarButton = getRequiredElementById('t2i-top-split-quickbutton');
        this.bottomSplitBar = getRequiredElementById('t2i-mid-split-bar');
        this.bottomSplitBarButton = getRequiredElementById('t2i-mid-split-quickbutton');
        this.topSection = getRequiredElementById('t2i_top_bar');
        this.bottomInfoBar = getRequiredElementById('bottom_info_bar');
        this.bottomBar = getRequiredElementById('t2i_bottom_bar');
        this.inputSidebar = getRequiredElementById('input_sidebar');
        this.mainImageArea = getRequiredElementById('main_image_area');
        this.currentImage = getRequiredElementById('current_image');
        this.currentImageWrapbox = getRequiredElementById('current_image_wrapbox');
        this.currentImageBatch = getRequiredElementById('current_image_batch_wrapper');
        this.currentImageBatchCore = getRequiredElementById('current_image_batch');
        this.altRegion = getRequiredElementById('alt_prompt_region');
        this.altText = getRequiredElementById('alt_prompt_textbox');
        this.altNegText = getRequiredElementById('alt_negativeprompt_textbox');
        this.altImageRegion = getRequiredElementById('alt_prompt_extra_area');
        this.editorSizebar = getRequiredElementById('image_editor_sizebar');
        this.tabCollections = document.querySelectorAll('.swarm-gen-tab-subnav');
        this.layoutConfigArea = getRequiredElementById('layoutconfigarea');
        this.toolContainer = getRequiredElementById('tool_container');
        this.managedTabs = [...this.tabCollections].flatMap(e => [...e.querySelectorAll('.nav-link')]).map(e => new MovableGenTab(e, this));
        this.managedTabContainers = [];
        this.leftBarDrag = false;
        this.rightBarDrag = false;
        this.bottomBarDrag = false;
        this.imageEditorSizeBarDrag = false;
        this.isSmallWindow = window.innerWidth < 768 || window.innerHeight < 768;
    }

    /** Resets the entire page layout to default, and removes all stored browser layout state info. */
    resetLayout() {
        for (let localStore of Object.keys(localStorage).filter(k => k.startsWith('barspot_'))) {
            localStorage.removeItem(localStore);
        }
        this.leftSectionBarPos = -1;
        this.rightSectionBarPos = -1;
        this.bottomSectionBarPos = -1;
        this.imageEditorBarPos = -1;
        this.bottomShut = false;
        this.leftShut = false;
        this.reapplyPositions();
        for (let runnable of this.layoutResets) {
            runnable();
        }
    }

    /** Sets whether the bottom section should be shut (does not trigger rerendering). */
    setBottomShut(val) {
        this.bottomShut = val;
        localStorage.setItem('barspot_midForceToBottom', `${this.bottomShut}`);
    }

    /** Sets whether the left section should be shut (does not trigger rerendering). */
    setLeftShut(val) {
        this.leftShut = val;
        localStorage.setItem('barspot_leftShut', `${this.leftShut}`);
    }
    
    /** Signal a possible update to the size of the prompt box. */
    altPromptSizeHandle() {
        this.altRegion.style.top = `calc(-${this.altText.offsetHeight + this.altNegText.offsetHeight + this.altImageRegion.offsetHeight}px - 1rem - 7px)`;
        this.reapplyPositions();
    }
    
    /** Does the full position update logic. */
    reapplyPositions() {
        tweakNegativePromptBox();
        if (this.altRegion.style.display != 'none') {
            dynamicSizeTextBox(this.altText);
            dynamicSizeTextBox(this.altNegText);
            this.altRegion.style.top = `calc(-${this.altText.offsetHeight + this.altNegText.offsetHeight + this.altImageRegion.offsetHeight}px - 1rem - 7px)`;
        }
        setCookie('barspot_pageBarTop', this.leftSectionBarPos, 365);
        setCookie('barspot_pageBarTop2', this.rightSectionBarPos, 365);
        setCookie('barspot_pageBarMidPx', this.bottomSectionBarPos, 365);
        setCookie('barspot_imageEditorSizeBar', this.imageEditorBarPos, 365);
        this.toolContainer.style.minHeight = `calc(100% - ${this.toolContainer.getBoundingClientRect().top - this.toolContainer.parentElement.getBoundingClientRect().top}px - 1.5rem)`;
        let barTopLeft = this.leftShut ? `0px` : this.leftSectionBarPos == -1 ? (this.isSmallWindow ? `14rem` : `28rem`) : `${this.leftSectionBarPos}px`;
        let barTopRight = this.rightSectionBarPos == -1 ? (this.isSmallWindow ? `4rem` : `21rem`) : `${this.rightSectionBarPos}px`;
        let curImgWidth = `100vw - ${barTopLeft} - ${barTopRight} - 10px`;
        // TODO: this 'eval()' hack to read the size in advance is a bit cursed.
        let fontRem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        let curImgWidthNum = eval(curImgWidth.replace(/vw/g, `* ${window.innerWidth * 0.01}`).replace(/rem/g, `* ${fontRem}`).replace(/px/g, ''));
        if (curImgWidthNum < 400) {
            barTopRight = `${barTopRight} + ${400 - curImgWidthNum}px`;
            curImgWidth = `100vw - ${barTopLeft} - ${barTopRight} - 10px`;
        }
        this.inputSidebar.style.width = `${barTopLeft}`;
        this.inputSidebar.style.display = this.leftShut ? 'none' : '';
        this.altRegion.style.width = `calc(100vw - ${barTopLeft} - ${barTopRight} - 10px)`;
        this.mainImageArea.style.width = `calc(100vw - ${barTopLeft})`;
        this.mainImageArea.scrollTop = 0;
        if (imageEditor && imageEditor.active) {
            let imageEditorSizePercent = this.imageEditorBarPos < 0 ? 0.5 : (this.imageEditorBarPos / 100.0);
            imageEditor.inputDiv.style.width = `calc((${curImgWidth}) * ${imageEditorSizePercent})`;
            this.currentImage.style.width = `calc((${curImgWidth}) * ${(1.0 - imageEditorSizePercent)} - 6px)`;
        }
        else {
            this.currentImage.style.width = `calc(${curImgWidth})`;
        }
        this.currentImageWrapbox.style.width = `calc(${curImgWidth})`;
        this.currentImageBatch.style.width = `calc(${barTopRight} - 6px)`;
        if (this.currentImageBatchCore.offsetWidth < 425) {
            this.currentImageBatchCore.classList.add('current_image_batch_core_small');
        }
        else {
            this.currentImageBatchCore.classList.remove('current_image_batch_core_small');
        }
        this.leftSplitBarButton.innerHTML = this.leftShut ? '&#x21DB;' : '&#x21DA;';
        this.bottomSplitBarButton.innerHTML = this.bottomShut ? '&#x290A;' : '&#x290B;';
        let altHeight = this.altRegion.style.display == 'none' ? '0px' : `${this.altRegion.offsetHeight}px`;
        if (this.bottomSectionBarPos != -1 || this.bottomShut) {
            let fixed = this.bottomShut ? `6.5rem` : `${this.bottomSectionBarPos}px`;
            this.leftSplitBar.style.height = `calc(100vh - ${fixed})`;
            this.rightSplitBar.style.height = `calc(100vh - ${fixed} - 5px)`;
            this.inputSidebar.style.height = `calc(100vh - ${fixed})`;
            this.mainImageArea.style.height = `calc(100vh - ${fixed})`;
            this.currentImageWrapbox.style.height = `calc(100vh - ${fixed} - ${altHeight})`;
            if (imageEditor) {
                imageEditor.inputDiv.style.height = `calc(100vh - ${fixed} - ${altHeight})`;
            }
            this.editorSizebar.style.height = `calc(100vh - ${fixed} - ${altHeight})`;
            this.currentImageBatch.style.height = `calc(100vh - ${fixed})`;
            this.topSection.style.height = `calc(100vh - ${fixed})`;
            let bottomBarHeight = this.bottomInfoBar.offsetHeight;
            this.bottomBar.style.height = `calc(${fixed} - ${bottomBarHeight}px - 5px)`;
        }
        else {
            this.leftSplitBar.style.height = 'calc(49vh)';
            this.rightSplitBar.style.height = 'calc(49vh)';
            this.inputSidebar.style.height = '';
            this.mainImageArea.style.height = '';
            this.currentImageWrapbox.style.height = `calc(49vh - ${altHeight} + 1rem)`;
            if (imageEditor) {
                imageEditor.inputDiv.style.height = `calc(49vh - ${altHeight})`;
            }
            this.editorSizebar.style.height = `calc(49vh - ${altHeight})`;
            this.currentImageBatch.style.height = '';
            this.topSection.style.height = '';
            let bottomBarHeight = this.bottomInfoBar.offsetHeight;
            this.bottomBar.style.height = `calc(49vh - ${bottomBarHeight}px - 5px)`;
        }
        if (imageEditor) {
            imageEditor.resize();
        }
        alignImageDataFormat();
        for (let collection of this.tabCollections) {
            collection.style.display = [...collection.querySelectorAll('.nav-link')].length > 1 ? '' : 'none';
        }
        for (let container of this.managedTabContainers) {
            let parent = container.parentElement;
            let offset = container.getBoundingClientRect().top - parent.getBoundingClientRect().top;
            container.style.height = `calc(100% - ${offset}px)`;
        }
        browserUtil.makeVisible(document);
    }

    /** Internal initialization of the generate tab. */
    init() {
        for (let tab of this.managedTabs) {
            tab.contentElem.style.height = '100%';
            tab.contentElem.style.width = '100%';
            if (!this.managedTabContainers.includes(tab.contentElem.parentElement)) {
                this.managedTabContainers.push(tab.contentElem.parentElement);
            }
            if (this.hideTabs.includes(tab.id)) {
                tab.visible = false;
            }
            tab.update();
            tab.navElem.addEventListener('click', () => {
                browserUtil.makeVisible(tab.contentElem);
            });
        }
        this.reapplyPositions();
        this.leftSplitBar.addEventListener('mousedown', (e) => {
            this.leftBarDrag = true;
            e.preventDefault();
        }, true);
        this.rightSplitBar.addEventListener('mousedown', (e) => {
            this.rightBarDrag = true;
            e.preventDefault();
        }, true);
        this.leftSplitBar.addEventListener('touchstart', (e) => {
            this.leftBarDrag = true;
            e.preventDefault();
        }, true);
        this.rightSplitBar.addEventListener('touchstart', (e) => {
            this.rightBarDrag = true;
            e.preventDefault();
        }, true);
        this.editorSizebar.addEventListener('mousedown', (e) => {
            this.imageEditorSizeBarDrag = true;
            e.preventDefault();
        }, true);
        this.editorSizebar.addEventListener('touchstart', (e) => {
            this.imageEditorSizeBarDrag = true;
            e.preventDefault();
        }, true);
        this.bottomSplitBar.addEventListener('mousedown', (e) => {
            if (e.target == this.bottomSplitBarButton) {
                return;
            }
            this.bottomBarDrag = true;
            this.setBottomShut(false);
            e.preventDefault();
        }, true);
        this.bottomSplitBar.addEventListener('touchstart', (e) => {
            if (e.target == this.bottomSplitBarButton) {
                return;
            }
            this.bottomBarDrag = true;
            this.setBottomShut(false);
            e.preventDefault();
        }, true);
        this.bottomSplitBarButton.addEventListener('click', (e) => {
            this.bottomBarDrag = false;
            this.setBottomShut(!this.bottomShut);
            this.bottomSectionBarPos = Math.max(this.bottomSectionBarPos, 400);
            this.reapplyPositions();
            e.preventDefault();
        }, true);
        this.leftSplitBarButton.addEventListener('click', (e) => {
            this.leftBarDrag = false;
            this.setLeftShut(!this.leftShut);
            this.leftSectionBarPos = Math.max(this.leftSectionBarPos, 400);
            this.reapplyPositions();
            e.preventDefault();
            triggerChangeFor(this.altText);
            triggerChangeFor(this.altNegText);
        }, true);
        let moveEvt = (e, x, y) => {
            let offX = x;
            offX = Math.min(Math.max(offX, 100), window.innerWidth - 10);
            if (this.leftBarDrag) {
                this.leftSectionBarPos = Math.min(offX - 3, 51 * 16);
                this.setLeftShut(this.leftSectionBarPos < 300);
                this.reapplyPositions();
            }
            if (this.rightBarDrag) {
                this.rightSectionBarPos = window.innerWidth - offX;
                if (this.rightSectionBarPos < 100) {
                    this.rightSectionBarPos = 22;
                }
                this.reapplyPositions();
            }
            if (this.imageEditorSizeBarDrag) {
                let maxAreaWidth = imageEditor.inputDiv.offsetWidth + this.currentImage.offsetWidth + 10;
                let imageAreaLeft = imageEditor.inputDiv.getBoundingClientRect().left;
                let val = Math.min(Math.max(offX - imageAreaLeft + 3, 200), maxAreaWidth - 200);
                this.imageEditorBarPos = Math.min(90, Math.max(10, val / maxAreaWidth * 100));
                this.reapplyPositions();
            }
            if (this.bottomBarDrag) {
                const MID_OFF = 85;
                let refY = Math.min(Math.max(e.pageY, MID_OFF), window.innerHeight - MID_OFF);
                this.setBottomShut(refY >= window.innerHeight - MID_OFF);
                this.bottomSectionBarPos = window.innerHeight - refY + this.topSection.getBoundingClientRect().top + 3;
                this.reapplyPositions();
            }
        };
        document.addEventListener('mousemove', (e) => moveEvt(e, e.pageX, e.pageY));
        document.addEventListener('touchmove', (e) => moveEvt(e, e.touches.item(0).pageX, e.touches.item(0).pageY));
        document.addEventListener('mouseup', (e) => {
            this.leftBarDrag = false;
            this.rightBarDrag = false;
            this.bottomBarDrag = false;
            this.imageEditorSizeBarDrag = false;
        });
        document.addEventListener('touchend', (e) => {
            this.leftBarDrag = false;
            this.rightBarDrag = false;
            this.bottomBarDrag = false;
            this.imageEditorSizeBarDrag = false;
        });
        for (let tab of getRequiredElementById('bottombartabcollection').getElementsByTagName('a')) {
            tab.addEventListener('click', (e) => {
                this.setBottomShut(false);
                this.reapplyPositions();
            });
        }
        this.altText.addEventListener('keydown', (e) => {
            if (e.key == 'Enter' && !e.shiftKey) {
                this.altText.dispatchEvent(new Event('change'));
                getRequiredElementById('alt_generate_button').click();
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });
        this.altNegText.addEventListener('keydown', (e) => {
            if (e.key == 'Enter' && !e.shiftKey) {
                this.altNegText.dispatchEvent(new Event('change'));
                getRequiredElementById('alt_generate_button').click();
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });
        this.altText.addEventListener('input', (e) => {
            let inputPrompt = document.getElementById('input_prompt');
            if (inputPrompt) {
                inputPrompt.value = this.altText.value;
            }
            setCookie(`lastparam_input_prompt`, this.altText.value, getParamMemoryDays());
            textPromptDoCount(this.altText, getRequiredElementById('alt_text_tokencount'));
            monitorPromptChangeForEmbed(this.altText.value, 'positive');
            setGroupAdvancedOverride('regionalprompting', this.altText.value.includes('<segment:') || this.altText.value.includes('<region:'));
        });
        this.altText.addEventListener('input', () => {
            setCookie(`lastparam_input_prompt`, this.altText.value, getParamMemoryDays());
            this.reapplyPositions();
        });
        this.altNegText.addEventListener('input', (e) => {
            let inputNegPrompt = document.getElementById('input_negativeprompt');
            if (inputNegPrompt) {
                inputNegPrompt.value = this.altNegText.value;
            }
            setCookie(`lastparam_input_negativeprompt`, this.altNegText.value, getParamMemoryDays());
            let negTokCount = getRequiredElementById('alt_negtext_tokencount');
            if (this.altNegText.value == '') {
                negTokCount.style.display = 'none';
            }
            else {
                negTokCount.style.display = '';
            }
            textPromptDoCount(this.altNegText, negTokCount, ', Neg: ');
            monitorPromptChangeForEmbed(this.altNegText.value, 'negative');
        });
        this.altNegText.addEventListener('input', () => {
            setCookie(`lastparam_input_negativeprompt`, this.altNegText.value, getParamMemoryDays());
            this.reapplyPositions();
        });
        this.altPromptSizeHandle();
        new ResizeObserver(this.altPromptSizeHandle.bind(this)).observe(this.altText);
        new ResizeObserver(this.altPromptSizeHandle.bind(this)).observe(this.altNegText);
        textPromptAddKeydownHandler(this.altText);
        textPromptAddKeydownHandler(this.altNegText);
        addEventListener("resize", this.reapplyPositions.bind(this));
        textPromptAddKeydownHandler(getRequiredElementById('edit_wildcard_contents'));
        this.buildConfigArea();
    }

    rebuildVisibleCookie() {
        setCookie('layout_hidetabs', this.managedTabs.filter(t => !t.visible).map(t => t.id).join(','), 365);
    }

    updateConfigFor(id) {
        let tab = this.managedTabs.find(t => t.id == id);
        if (tab) {
            tab.visible = getRequiredElementById(`tabconfig_${id}_visible`).checked;
            tab.targetGroupId = getRequiredElementById(`tabconfig_${id}_group`).value;
            tab.update();
            this.buildConfigArea();
        }
    }

    buildConfigArea() {
        let html = '<table class="simple-table">\n<tr><th>Tab</th><th>Group</th><th>Visible</th></tr>\n';
        let selectOptions = filterDistinctBy(this.managedTabs.map(t => t.defaultGroup), g => g.id).map(e => `<option value="${e.id}">${escapeHtml(e.dataset.title)}</option>`).join('\n');
        for (let tab of this.managedTabs) {
            html += `<tr>
                    <td><b>${escapeHtml(tab.title)}</b></td>
                    <td><select id="tabconfig_${tab.id}_group">${selectOptions}</select></td>
                    <td><input type="checkbox" id="tabconfig_${tab.id}_visible" ${tab.visible ? 'checked' : ''}></td>
                </tr>`;
        }
        html += '</table>';
        this.layoutConfigArea.innerHTML = html;
        for (let tab of this.managedTabs) {
            getRequiredElementById(`tabconfig_${tab.id}_group`).value = tab.targetGroupId;
            getRequiredElementById(`tabconfig_${tab.id}_visible`).addEventListener('change', () => this.updateConfigFor(tab.id));
            getRequiredElementById(`tabconfig_${tab.id}_group`).addEventListener('change', () => this.updateConfigFor(tab.id));
        }
        this.rebuildVisibleCookie();
    }

    resetSubTabs() {
        if (confirm('Are you sure you want to reset the layout of the subtabs?\nThis will make all sub-tabs visible, and put them in their default locations.')) {
            for (let tab of this.managedTabs) {
                tab.targetGroupId = tab.defaultGroup.id;
                tab.visible = true;
                tab.update();
            }
            this.reapplyPositions();
            this.buildConfigArea();
        }
    }
}

/** Central handler for generate main tab layout logic. */
let genTabLayout = new GenTabLayout();
