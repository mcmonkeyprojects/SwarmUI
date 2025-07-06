
let postParamBuildSteps = [];

let refreshParamsExtra = [];

/** Set 'id': true to indicate that advanced status should be overridden for a group, ie it should be visible even when Display Advanced is unchecked. */
let groupAdvancedOverrides = {};

// TODO: Temporary (v0.9.6) legacy cookie cleanup
for (let cookie of listCookies('group_toggle_auto-group-')) {
    deleteCookie(cookie);
}
for (let cookie of listCookies('group_open_auto-group-')) {
    deleteCookie(cookie);
}

function setGroupAdvancedOverride(groupId, enable) {
    if (groupAdvancedOverrides[groupId] && !enable) {
        delete groupAdvancedOverrides[groupId];
        hideUnsupportableParams();
    }
    else if (enable && !groupAdvancedOverrides[groupId]) {
        groupAdvancedOverrides[groupId] = true;
        hideUnsupportableParams();
    }
}

class AspectRatio {
    constructor(id, width, height, altLogic = null) {
        this.id = id;
        this.width = width;
        this.height = height;
        this.ratio = width / height;
        this.altLogic = altLogic;
    }

    read(inWidth, inHeight, doAltLogic = true) {
        if (this.altLogic && doAltLogic) {
            let [newWidth, newHeight] = this.altLogic(inWidth, inHeight);
            if (newWidth && newHeight) {
                return [newWidth, newHeight];
            }
        }
        if (inWidth != inHeight) {
            inWidth = roundTo(Math.sqrt(inWidth * inHeight), 16);
            inHeight = inWidth;
        }
        // NOTE: This math must match T2IParamInput GetImageWidth
        let width = roundTo(this.width * (inWidth <= 0 ? 512 : inWidth) / 512, 16);
        let height = roundTo(this.height * (inHeight <= 0 ? 512 : inHeight) / 512, 16);
        return [width, height];
    }
}

let aspectRatios = [
    new AspectRatio("1:1", 512, 512),
    new AspectRatio("4:3", 576, 448),
    new AspectRatio("3:2", 608, 416, (w, h) => {
        if (w == 768 && h == 512) {
            return [768, 512];
        }
        return [null, null];
    }),
    new AspectRatio("8:5", 608, 384),
    new AspectRatio("16:9", 672, 384, (w, h) => {
        if (w == 640 && h == 640) {
            return [832, 480]; // Wan 2.1, 1.3b
        }
        else if (w == 960 && h == 960) {
            return [1280, 720]; // Wan 2.1, 14b
        }
        return [null, null];
    }),
    new AspectRatio("21:9", 768, 320),
    new AspectRatio("3:4", 448, 576),
    new AspectRatio("2:3", 416, 608, (w, h) => {
        if (w == 768 && h == 512) {
            return [768, 512];
        }
        return [null, null];
    }),
    new AspectRatio("5:8", 384, 608),
    new AspectRatio("9:16", 384, 672, (w, h) => {
        if (w == 640 && h == 640) {
            return [480, 832]; // Wan 2.1, 1.3b
        }
        else if (w == 960 && h == 960) {
            return [720, 1280]; // Wan 2.1, 14b
        }
        return [null, null];
    }),
    new AspectRatio("9:21", 320, 768)
];


function getHtmlForParam(param, prefix) {
    try {
        let example = param.examples ? `<br><span class="translate">Examples</span>: <code>${param.examples.map(escapeHtmlNoBr).join(`</code>,&emsp;<code>`)}</code>` : '';
        let pop = param.no_popover ? '' : `<div class="sui-popover sui-info-popover" id="popover_${prefix}${param.id}"><b class="translate">${escapeHtmlNoBr(param.name)}</b> (${param.type}):<br><span class="translate slight-left-margin-block">${safeHtmlOnly(param.description)}</span>${example}</div>`;
        switch (param.type) {
            case 'text':
                let runnable = param.view_type == 'prompt' ? () => {
                    let pElem = getRequiredElementById(`${prefix}${param.id}`);
                    textPromptAddKeydownHandler(pElem);
                    textPromptInputHandle(pElem);
                } : (param.view_type == 'big' ? () => dynamicSizeTextBox(getRequiredElementById(`${prefix}${param.id}`, 32)): null);
                return {html: makeTextInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, param.view_type, param.description, param.toggleable, false, !param.no_popover) + pop, runnable: runnable};
            case 'decimal':
            case 'integer':
                let min = param.min, max = param.max, step = param.step || 1;
                if (!min && min != 0) {
                    min = -9999999;
                }
                if (!max && max != 0) {
                    max = 9999999;
                }
                switch (param.view_type) {
                    case 'small':
                        return {html: makeNumberInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, min, max, step, 'small', param.toggleable, !param.no_popover) + pop,
                        runnable: () => autoNumberWidth(getRequiredElementById(`${prefix}${param.id}`))};
                    case 'normal':
                    case 'big':
                        return {html: makeNumberInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, min, max, step, 'big', param.toggleable, !param.no_popover) + pop,
                        runnable: () => autoNumberWidth(getRequiredElementById(`${prefix}${param.id}`))};
                    case 'seed':
                        return {html: makeNumberInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, min, max, step, 'seed', param.toggleable, !param.no_popover) + pop};
                    case 'slider':
                        return {html: makeSliderInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, min, max, param.view_min || min, param.view_max || max, step, false, param.toggleable, !param.no_popover) + pop,
                            runnable: () => enableSliderAbove(getRequiredElementById(`${prefix}${param.id}`))};
                    case 'pot_slider':
                        return {html: makeSliderInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, min, max, param.view_min || min, param.view_max || max, step, true, param.toggleable, !param.no_popover) + pop,
                            runnable: () => enableSliderAbove(getRequiredElementById(`${prefix}${param.id}`))};
                }
                break;
            case 'boolean':
                return {html: makeCheckboxInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, param.toggleable, false, !param.no_popover) + pop};
            case 'dropdown':
                return {html: makeDropdownInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.values, param.default, param.toggleable, !param.no_popover, param['value_names']) + pop,
                        runnable: () => autoSelectWidth(getRequiredElementById(`${prefix}${param.id}`))};
            case 'list':
                if (param.values) {
                    return {html: makeMultiselectInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.values, param.default, "Select...", param.toggleable, !param.no_popover) + pop,
                        runnable: () => {
                            $(`#${prefix}${param.id}`).select2({ theme: "bootstrap-5", width: 'style', placeholder: $(this).data('placeholder'), closeOnSelect: false });
                        }
                    };
                }
                return {html: makeTextInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.default, param.view_type, param.description, param.toggleable, false, !param.no_popover) + pop};
            case 'model':
                let modelList = param.values && param.values.length > 0 ? param.values : coreModelMap[param.subtype || 'Stable-Diffusion'];
                modelList = modelList.map(m => cleanModelName(m));
                return {html: makeDropdownInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, modelList, param.default, param.toggleable, !param.no_popover) + pop,
                    runnable: () => autoSelectWidth(getRequiredElementById(`${prefix}${param.id}`))};
            case 'image':
                return {html: makeImageInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.toggleable, !param.no_popover) + pop};
            case 'image_list':
                return {html: makeImageInput(param.feature_flag, `${prefix}${param.id}`, param.id, param.name, param.description, param.toggleable, !param.no_popover) + pop};
        }
        console.log(`Cannot generate input for param ${param.id} of type ${param.type} - unknown type`);
        return null;
    }
    catch (e) {
        console.log(e);
        throw new Error(`Error generating input for param '${param.id}' (${JSON.stringify(param)}): ${e}`);
    }
}

function toggleGroupOpen(elem, shouldOpen = null) {
    let parent = findParentOfClass(elem, 'input-group');
    let group = parent.querySelector('.input-group-content');
    let isClosed = group.style.display == 'none';
    if (shouldOpen == null) {
        shouldOpen = isClosed;
    }
    doGroupOpenUpdate(group, parent, shouldOpen);
}

let isParamUnsupportableUpdateScheduled = false;

function scheduleParamUnsupportUpdate() {
    if (!isParamUnsupportableUpdateScheduled) {
        isParamUnsupportableUpdateScheduled = true;
        setTimeout(() => {
            isParamUnsupportableUpdateScheduled = false;
            hideUnsupportableParams();
        }, 5);
    }
}

function doGroupOpenUpdate(group, parent, isOpen) {
    let header = parent.querySelector('.input-group-header');
    parent.classList.remove('input-group-closed');
    parent.classList.remove('input-group-open');
    let symbol = parent.querySelector('.auto-symbol');
    let groupId = parent.id.substring('auto-group-'.length);
    if (isOpen || header.classList.contains('input-group-noshrink')) {
        group.style.display = 'flex';
        parent.classList.add('input-group-open');
        if (symbol) {
            symbol.innerHTML = '&#x2B9F;';
        }
        if (!group.dataset.do_not_save) {
            setCookie(`group_open_${groupId}`, 'open', getParamMemoryDays());
        }
    }
    else {
        group.style.display = 'none';
        parent.classList.add('input-group-closed');
        if (symbol) {
            symbol.innerHTML = '&#x2B9E;';
        }
        if (!group.dataset.do_not_save) {
            setCookie(`group_open_${groupId}`, 'closed', getParamMemoryDays());
        }
    }
    scheduleParamUnsupportUpdate();
}

function doToggleGroup(id) {
    let elem = getRequiredElementById(`${id}_toggle`);
    let parent = findParentOfClass(elem, 'input-group');
    let header = parent.querySelector('.input-group-header .header-label-wrap');
    let group = parent.querySelector('.input-group-content');
    if (elem.checked) {
        header.classList.add('input-group-header-activated');
        group.classList.add('input-group-content-activated');
    }
    else {
        header.classList.remove('input-group-header-activated');
        group.classList.remove('input-group-content-activated');
    }
    let groupId = parent.id.substring('auto-group-'.length);
    if (!group.dataset.do_not_save) {
        setCookie(`group_toggle_${groupId}`, elem.checked ? 'yes' : 'no', getParamMemoryDays());
    }
    doGroupOpenUpdate(group, parent, group.style.display != 'none');
}

function isParamAdvanced(p) {
    return p.group ? p.group.advanced : p.advanced;
}

document.addEventListener('click', e => {
    if (e.target.onclick) {
        return;
    }
    let header = findParentOfClass(e.target, 'input-group-header');
    if (header) {
        toggleGroupOpen(header);
    }
});

function getParamMemoryDays() {
    return parseFloat(getUserSetting('parametermemorydurationhours', '6')) / 24;
}

/** Re-persist stored parameter values - to avoid some disappearing and others staying */
function autoRepersistParams() {
    let hrs = getUserSetting('parametermemorydurationhours', 'none');
    if (hrs == 'none') { // (Avoid repersisting if the user setting isn't loaded)
        return;
    }
    let days = parseFloat(hrs) / 24;
    let groups = [];
    for (let param of gen_param_types) {
        let val = getCookie(`lastparam_input_${param.id}`);
        if (val) {
            setCookie(`lastparam_input_${param.id}`, val, days);
        }
        if (param.toggleable) {
            let val = getCookie(`lastparam_input_${param.id}_toggle`);
            if (val) {
                setCookie(`lastparam_input_${param.id}_toggle`, val, days);
            }
        }
        if (param.group && !groups.includes(param.group.id)) {
            groups.push(param.group.id);
            let open = getCookie(`group_open_${param.group.id}`);
            if (open) {
                setCookie(`group_open_${param.group.id}`, open, days);
            }
            if (param.group.toggles) {
                let toggle = getCookie(`group_toggle_${param.group.id}`);
                if (toggle) {
                    setCookie(`group_toggle_${param.group.id}`, toggle, days);
                }
            }
        }
    }
}

function genInputs(delay_final = false) {
    let runnables = [];
    let groupsClose = [];
    let groupsEnable = [];
    let isPrompt = (p) => p.id == 'prompt' || p.id == 'negativeprompt';
    let defaultPromptVisible = rawGenParamTypesFromServer.find(p => isPrompt(p)).visible;
    for (let areaData of [['main_inputs_area', 'new_preset_modal_inputs', (p) => (p.visible || isPrompt(p)), true],
            ['main_inputs_area_hidden', 'new_preset_modal_hidden_inputs', (p) => (!p.visible || isPrompt(p)), false]]) {
        let area = getRequiredElementById(areaData[0]);
        area.innerHTML = '';
        let presetArea = areaData[1] ? getRequiredElementById(areaData[1]) : null;
        let html = '', presetHtml = '';
        let isMain = areaData[3];
        if (isMain && defaultPromptVisible) {
            html += `<button class="generate-button" id="generate_button" onclick="getRequiredElementById('alt_generate_button').click()" oncontextmenu="return getRequiredElementById('alt_generate_button').oncontextmenu()">Generate</button>
            <button class="interrupt-button legacy-interrupt interrupt-button-none" id="interrupt_button" onclick="getRequiredElementById('alt_interrupt_button').click()" oncontextmenu="return getRequiredElementById('alt_interrupt_button').oncontextmenu()">&times;</button>`;
        }
        let allParams = gen_param_types.filter(areaData[2]);
        let groupMap = {};
        let pushGroup = (group) => {
            let map = groupMap;
            if (group.parent) {
                let parent = pushGroup(group.parent);
                map = parent.children;
            }
            if (!map[group.id]) {
                map[group.id] = { group: group, children: {}, params: [] };
            }
            return map[group.id];
        };
        for (let param of allParams) {
            let group = param.group ?? { id: '-ungrouped-', name: '-ungrouped-', priority: -99999999, parent: null };
            pushGroup(group).params.push(param);
        }
        let groups = Object.values(groupMap).sort((a, b) => a.group.priority - b.group.priority);
        function appendGroup(groupHolder) {
            let group = groupHolder.group;
            let groupId = group.id;
            if (groupId != '-ungrouped-') {
                let infoButton = '';
                if (group.description) {
                    html += `<div class="sui-popover sui-info-popover" id="popover_group_${groupId}"><b>${translateableHtml(escapeHtml(group.name))}</b>:<br>&emsp;${translateableHtml(safeHtmlOnly(group.description))}</div>`;
                    infoButton = `<span class="auto-input-qbutton info-popover-button" onclick="doPopover('group_${groupId}', arguments[0])">?</span>`;
                }
                let shouldOpen = getCookie(`group_open_${groupId}`) || (group.open ? 'open' : 'closed');
                if (shouldOpen == 'closed') {
                    groupsClose.push(groupId);
                }
                if (group.toggles) {
                    let shouldToggle = getCookie(`group_toggle_${groupId}`) || 'no';
                    if (shouldToggle == 'yes') {
                        groupsEnable.push(groupId);
                    }
                }
                let symbol = group.can_shrink ? '<span class="auto-symbol">&#x2B9F;</span>' : '';
                let shrinkClass = group.can_shrink ? 'input-group-shrinkable' : 'input-group-noshrink';
                let extraSpanInfo = group.id == 'revision' ? ' style="display: none;"' : '';
                let openClass = shouldOpen == 'closed' ? 'input-group-closed' : 'input-group-open';
                let extraContentInfo = shouldOpen == 'closed' ? ' style="display: none;"' : '';
                let toggler = getToggleHtml(group.toggles, `input_group_content_${groupId}`, escapeHtml(group.name), ' group-toggler-switch', 'doToggleGroup');
                html += `<div class="input-group ${openClass}" id="auto-group-${groupId}"><span${extraSpanInfo} id="input_group_${groupId}" class="input-group-header ${shrinkClass}"><span class="header-label-wrap">${symbol}<span class="header-label">${translateableHtml(escapeHtml(group.name))}</span>${infoButton}<span class="header-label-spacer"></span><span class="header-label-counter"></span>${toggler || ''}</span></span><div${extraContentInfo} class="input-group-content" id="input_group_content_${groupId}">`;
                if (presetArea) {
                    presetHtml += `<div class="input-group ${openClass}"><span id="input_group_preset_${groupId}" class="input-group-header ${shrinkClass}">${symbol}${translateableHtml(escapeHtml(group.name))}</span><div class="input-group-content">`;
                }
            }
            for (let param of groupHolder.params.sort((a, b) => a.priority - b.priority)) {
                if (isPrompt(param) ? param.visible == isMain : true) {
                    let newData = getHtmlForParam(param, "input_");
                    html += newData.html;
                    if (newData.runnable) {
                        runnables.push(newData.runnable);
                    }
                }
                if (isPrompt(param) ? isMain : true) {
                    let presetParam = JSON.parse(JSON.stringify(param));
                    presetParam.toggleable = true;
                    let presetData = getHtmlForParam(presetParam, "preset_input_");
                    presetHtml += presetData.html;
                    if (presetData.runnable) {
                        runnables.push(presetData.runnable);
                    }
                }
            }
            for (let child of Object.values(groupHolder.children).sort((a, b) => a.group.priority - b.group.priority)) {
                appendGroup(child);
            }
            if (groupId != '-ungrouped-') {
                html += '</div></div>';
                if (presetArea) {
                    presetHtml += '</div></div>';
                }
            }
        }
        for (let group of groups) {
            appendGroup(group);
        }
        area.innerHTML = html;
        if (presetArea) {
            presetArea.innerHTML = presetHtml;
        }
    }
    hideUnsupportableParams();
    let final = () => {
        for (let runnable of runnables) {
            runnable();
        }
        for (let group of groupsClose) {
            let elem = getRequiredElementById(`input_group_${group}`);
            toggleGroupOpen(elem, false);
            let pelem = document.getElementById(`input_group_preset_${group}`);
            if (pelem) {
                toggleGroupOpen(pelem, false);
            }
        }
        for (let group of groupsEnable) {
            let elem = document.getElementById(`input_group_content_${group}_toggle`);
            if (elem) {
                elem.checked = true;
                doToggleGroup(`input_group_content_${group}`);
            }
        }
        for (let param of gen_param_types) {
            if (param.toggleable) {
                doToggleEnable(`input_${param.id}`);
                doToggleEnable(`preset_input_${param.id}`);
            }
            if (param.group && param.group.toggles) {
                let elem = document.getElementById(`input_${param.id}`);
                if (elem) {
                    let groupId = param.group.id;
                    let groupToggler = document.getElementById(`input_group_content_${groupId}_toggle`);
                    if (groupToggler) {
                        function autoActivate() {
                            groupToggler.checked = true;
                            doToggleGroup(`input_group_content_${groupId}`);
                        }
                        // Tiny delay to avoid activating the group during setup
                        setTimeout(() => {
                            elem.addEventListener('focus', autoActivate);
                            elem.addEventListener('change', autoActivate);
                        }, 1);
                    }
                }
            }
        }
        let inputAspectRatio = document.getElementById('input_aspectratio');
        let inputWidth = document.getElementById('input_width');
        let inputHeight = document.getElementById('input_height');
        let inputSideLength = document.getElementById('input_sidelength');
        if (inputAspectRatio && inputWidth && inputHeight && inputSideLength) {
            let inputWidthParent = findParentOfClass(inputWidth, 'auto-slider-box');
            let inputWidthSlider = getRequiredElementById('input_width_rangeslider');
            let inputHeightParent = findParentOfClass(inputHeight, 'auto-slider-box');
            let inputHeightSlider = getRequiredElementById('input_height_rangeslider');
            let inputSideLengthParent = findParentOfClass(inputSideLength, 'auto-slider-box');
            let inputSideLengthSlider = getRequiredElementById('input_sidelength_rangeslider');
            let inputSideLengthToggle = getRequiredElementById('input_sidelength_toggle');
            let resGroupLabel = findParentOfClass(inputWidth, 'input-group').querySelector('.header-label');
            let inputAspectRatioParent = findParentOfClass(inputAspectRatio, 'auto-dropdown-box');
            let inputAspectRatioParentStyles = window.getComputedStyle(inputAspectRatioParent);
            let swapAspectRatioButton = document.createElement("button");
            inputAspectRatioParent.style.position = 'relative';
            swapAspectRatioButton.style.display = inputAspectRatio.value == "Custom" ? 'block' : 'none';
            swapAspectRatioButton.style.right = inputAspectRatioParentStyles.paddingRight;
            swapAspectRatioButton.style.top = inputAspectRatioParentStyles.paddingTop;
            swapAspectRatioButton.className = 'basic-button swap_aspectratio_button';
            swapAspectRatioButton.title = 'Swap the width and the height';
            swapAspectRatioButton.innerHTML = '&#x21C6;';
            inputAspectRatioParent.appendChild(swapAspectRatioButton);
            let resTrick = () => {
                let aspect;
                if (inputAspectRatio.value == "Custom") {
                    inputWidthParent.style.display = 'block';
                    inputHeightParent.style.display = 'block';
                    swapAspectRatioButton.style.display = 'block';
                    delete inputWidthParent.dataset.visible_controlled;
                    delete inputHeightParent.dataset.visible_controlled;
                    inputSideLengthParent.style.display = 'none';
                    inputSideLengthParent.dataset.visible_controlled = 'true';
                    aspect = describeAspectRatio(inputWidth.value, inputHeight.value);
                }
                else {
                    inputWidthParent.style.display = 'none';
                    inputHeightParent.style.display = 'none';
                    swapAspectRatioButton.style.display = 'none';
                    inputWidthParent.dataset.visible_controlled = 'true';
                    inputHeightParent.dataset.visible_controlled = 'true';
                    inputSideLengthParent.style.display = 'block';
                    delete inputSideLengthParent.dataset.visible_controlled;
                    aspect = inputAspectRatio.value;
                }
                resGroupLabel.innerText = `${translate('Resolution')}: ${aspect} (${inputWidth.value}x${inputHeight.value})`;
            };
            for (let target of [inputWidth, inputWidthSlider, inputHeight, inputHeightSlider]) {
                target.addEventListener('input', resTrick);
            }
            inputAspectRatio.addEventListener('change', () => {
                if (inputAspectRatio.value != "Custom") {
                    let aspectRatio = inputAspectRatio.value;
                    let targetWidth = curModelWidth;
                    let targetHeight = curModelHeight;
                    let doAltLogic = true;
                    if (inputSideLength.value && inputSideLengthToggle.checked) {
                        targetWidth = inputSideLength.value;
                        targetHeight = inputSideLength.value;
                        doAltLogic = false;
                    }
                    let width, height;
                    for (let ratio of aspectRatios) {
                        if (ratio.id == aspectRatio) {
                            [width, height] = ratio.read(targetWidth, targetHeight, doAltLogic);
                            break;
                        }
                    }
                    inputWidth.value = width;
                    inputHeight.value = height;
                    triggerChangeFor(inputWidth);
                    triggerChangeFor(inputHeight);
                }
                resTrick();
            });
            for (let target of [inputSideLength, inputSideLengthSlider, inputSideLengthToggle]) {
                target.addEventListener('change', () => {
                    triggerChangeFor(inputAspectRatio);
                });
            }
            swapAspectRatioButton.addEventListener('click', (event) => {
                event.preventDefault();
                let tmpWidth = inputWidth.value;
                inputWidth.value = inputHeight.value;
                inputHeight.value = tmpWidth;
                triggerChangeFor(inputWidth);
                triggerChangeFor(inputHeight);
            });
            inputWidth.addEventListener('change', () => {
                if (imageEditor.active) {
                    imageEditor.realWidth = parseInt(inputWidth.value);
                    imageEditor.redraw();
                    imageEditor.markChanged();
                }
            });
            inputHeight.addEventListener('change', () => {
                if (imageEditor.active) {
                    imageEditor.realHeight = parseInt(inputHeight.value);
                    imageEditor.redraw();
                    imageEditor.markChanged();
                }
            });
            resTrick();
        }
        autoRevealRevision();
        let inputPrompt = document.getElementById('input_prompt');
        if (inputPrompt) {
            let altText = getRequiredElementById('alt_prompt_textbox');
            let update = () => {
                altText.value = inputPrompt.value;
                triggerChangeFor(altText);
            };
            inputPrompt.addEventListener('input', update);
            inputPrompt.addEventListener('change', update);
        }
        let altPromptArea = getRequiredElementById('alt_prompt_region');
        if (defaultPromptVisible) {
            altPromptArea.style.display = 'none';
        }
        else {
            altPromptArea.style.display = 'block';
        }
        let inputNegativePrompt = document.getElementById('input_negativeprompt');
        if (inputNegativePrompt) {
            let altNegText = getRequiredElementById('alt_negativeprompt_textbox');
            let update = () => {
                altNegText.value = inputNegativePrompt.value;
                triggerChangeFor(altNegText);
            };
            inputNegativePrompt.addEventListener('input', update);
            inputNegativePrompt.addEventListener('change', update);
        }
        let inputCfgScale = document.getElementById('input_cfgscale');
        if (inputCfgScale) {
            inputCfgScale.addEventListener('change', () => {
                tweakNegativePromptBox();
            });
            tweakNegativePromptBox();
        }
        let inputLoras = document.getElementById('input_loras');
        if (inputLoras) {
            inputLoras.addEventListener('change', () => {
                updateLoraList();
                sdLoraBrowser.rebuildSelectedClasses();
            });
        }
        let inputLoraWeights = document.getElementById('input_loraweights');
        if (inputLoraWeights) {
            inputLoraWeights.addEventListener('change', reapplyLoraWeights);
        }
        let inputBatchSize = document.getElementById('input_batchsize');
        let shouldResetBatch = getUserSetting('resetbatchsizetoone', false);
        if (inputBatchSize && shouldResetBatch) {
            inputBatchSize.value = 1;
            triggerChangeFor(inputBatchSize);
        }
        let inputInterpolator1 = document.getElementById('input_textvideoframeinterpolationmethod');
        if (inputInterpolator1) {
            inputInterpolator1.addEventListener('change', () => {
                console.log(inputInterpolator1.value, currentBackendFeatureSet);
                if (inputInterpolator1.value == 'GIMM-VFI' && !currentBackendFeatureSet.includes('frameinterps_gimmvfi')) {
                    installFeatureById('gimm_vfi', null);
                }
            });
        }
        let inputInterpolator2 = document.getElementById('input_videoframeinterpolationmethod');
        if (inputInterpolator2) {
            inputInterpolator2.addEventListener('change', () => {
                if (inputInterpolator2.value == 'GIMM-VFI' && !currentBackendFeatureSet.includes('frameinterps_gimmvfi')) {
                    installFeatureById('gimm_vfi', null);
                }
            });
        }
        let inputInitImage = document.getElementById('input_initimage');
        if (inputInitImage && inputAspectRatio && inputWidth && inputHeight) {
            let targetDiv = findParentOfClass(inputInitImage, 'auto-input').querySelector('.auto-image-input-label');
            if (targetDiv) {
                let button = document.createElement('button');
                button.className = 'basic-button';
                button.innerText = 'Res';
                button.style.display = 'none';
                button.title = "Click for options to reuse the init image resolution for your main generation resolution";
                targetDiv.appendChild(button);
                inputInitImage.addEventListener('change', () => {
                    button.style.display = inputInitImage.dataset.filedata ? '' : 'none';
                });
                button.addEventListener('click', () => {
                    let rect = button.getBoundingClientRect();
                    let imageWidth = inputInitImage.dataset.width || 512;
                    let imageHeight = inputInitImage.dataset.height || 512;
                    new AdvancedPopover('initimage_res', [
                        {
                            key: 'Use Closest Aspect Ratio',
                            title: "Sets the Aspect Ratio parameter to whatever's closest, avoiding 'Custom'",
                            action: () => {
                                let closest = "1:1";
                                let closestDiff = 999999;
                                for (let ratio of aspectRatios) {
                                    let diff = Math.abs(ratio.ratio - (imageWidth / imageHeight));
                                    if (diff < closestDiff) {
                                        closest = ratio.id;
                                        closestDiff = diff;
                                    }
                                }
                                inputAspectRatio.value = closest;
                                triggerChangeFor(inputAspectRatio);
                            }
                        },
                        {
                            key: 'Use Exact Aspect Ratio',
                            title: "Sets the Aspect Ratio to Custom, and resolution to a perfectly matched aspect ratio for this image (rounded to x32 pixels)",
                            action: () => {
                                inputAspectRatio.value = "Custom";
                                triggerChangeFor(inputAspectRatio);
                                let ratio = imageWidth / imageHeight;
                                let width = Math.round(Math.sqrt(512 * 512 * ratio));
                                let height = Math.round(512 * 512 / width);
                                inputWidth.value = roundTo(width * (curModelWidth == 0 ? 512 : curModelWidth) / 512, 32);
                                inputHeight.value = roundTo(height * (curModelHeight == 0 ? 512 : curModelHeight) / 512, 32);
                                triggerChangeFor(inputWidth);
                                triggerChangeFor(inputHeight);
                            }
                        },
                        {
                            key: 'Use Resolution',
                            title: "Sets the Aspect Ratio to Custom, and resolution to exactly this image's resolution, with rounding to x32 pixels to avoid errors",
                            action: () => {
                                inputAspectRatio.value = "Custom";
                                inputWidth.value = roundTo(imageWidth, 32);
                                inputHeight.value = roundTo(imageHeight, 32);
                                triggerChangeFor(inputAspectRatio);
                                triggerChangeFor(inputWidth);
                                triggerChangeFor(inputHeight);
                            }
                        },
                        {
                            key: 'Use Exact Aspect Resolution',
                            title: "Sets the Aspect Ratio to Custom, and resolution to exactly this image's resolution, without any rounding",
                            action: () => {
                                inputAspectRatio.value = "Custom";
                                inputWidth.value = imageWidth;
                                inputHeight.value = imageHeight;
                                triggerChangeFor(inputAspectRatio);
                                triggerChangeFor(inputWidth);
                                triggerChangeFor(inputHeight);
                            }
                        }
                    ], false, rect.x, rect.y + rect.height, document.body);
                });
            }
        }
        shouldApplyDefault = true;
        for (let param of gen_param_types) {
            let elem = getRequiredElementById(`input_${param.id}`);
            let cookie = getCookie(`lastparam_input_${param.id}`);
            if (cookie) {
                shouldApplyDefault = false;
                if (param.type != "image") {
                    setDirectParamValue(param, cookie);
                }
            }
            let container = findParentOfClass(elem, 'auto-input');
            let nameBlock = container.querySelector('.auto-input-name');
            if (nameBlock) {
                nameBlock.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    let isStarred = param.group.id == 'starred';
                    new AdvancedPopover('param_name_context', [ { key: isStarred ? 'Unstar Parameter' : 'Star Parameter', action: () => {
                        if (!paramConfig.param_edits.params[param.id]) {
                            paramConfig.param_edits.params[param.id] = {};
                        }
                        if (isStarred) {
                            delete paramConfig.param_edits.params[param.id].group;
                            delete paramConfig.param_edits.params[param.id].advanced;
                        }
                        else {
                            paramConfig.param_edits.params[param.id].group = 'starred';
                            paramConfig.param_edits.params[param.id].advanced = false;
                        }
                        paramConfig.applyParamEdits(paramConfig.param_edits);
                        genericRequest('SetParamEdits', { edits: paramConfig.param_edits }, data => {});
                        setTimeout(() => {
                            genInputs();
                        }, 1);
                    }}
                    ], false, e.clientX, e.clientY, document.body, null);
                });
            }
            if (!param.do_not_save) {
                function getParamValue(param, elem) {
                    let val = null;
                    if (param.type == "boolean") {
                        val = elem.checked;
                    }
                    else if (param.type == "list" && elem.tagName == "SELECT") {
                        let valSet = [...elem.selectedOptions].map(option => option.value);
                        val = valSet.join(',');
                    }
                    else if (param.type != "image") {
                        val = elem.value;
                    }
                    return val;
                }
                elem.addEventListener('change', () => {
                    let val = getParamValue(param, elem);
                    if (val !== null) {
                        if (val == param.default) {
                            deleteCookie(`lastparam_input_${param.id}`);
                        }
                        else {
                            setCookie(`lastparam_input_${param.id}`, val, getParamMemoryDays());
                        }
                    }
                });
                if (param.toggleable) {
                    let toggler = getRequiredElementById(`input_${param.id}_toggle`);
                    let cookie = getCookie(`lastparam_input_${param.id}_toggle`);
                    if (cookie) {
                        toggler.checked = cookie == "true";
                    }
                    doToggleEnable(`input_${param.id}`);
                    if (!param.do_not_save) {
                        toggler.addEventListener('change', () => {
                            if (!toggler.checked) {
                                deleteCookie(`lastparam_input_${param.id}`);
                                deleteCookie(`lastparam_input_${param.id}_toggle`);
                            }
                            else {
                                setCookie(`lastparam_input_${param.id}_toggle`, toggler.checked, getParamMemoryDays());
                                let val = getParamValue(param, elem);
                                if (val !== null && val != param.default) {
                                    setCookie(`lastparam_input_${param.id}`, val, getParamMemoryDays());
                                }
                            }
                        });
                    }
                }
            }
        }
        let modelCookie = getCookie('selected_model');
        if (modelCookie) {
            directSetModel(modelCookie);
        }
        let modelInput = getRequiredElementById('input_model');
        modelInput.addEventListener('change', () => {
            forceSetDropdownValue('current_model', modelInput.value);
        });
        let vaeInput = document.getElementById('input_vae');
        if (vaeInput) {
            vaeInput.addEventListener('change', () => {
                sdVAEBrowser.browser.rerender();
            });
            getRequiredElementById('input_vae_toggle').addEventListener('change', () => {
                sdVAEBrowser.browser.rerender();
            });
            sdVAEBrowser.browser.rerender();
        }
        let controlnetGroup = document.getElementById('input_group_content_controlnet');
        if (controlnetGroup) {
            controlnetGroup.append(createDiv(`controlnet_button_preview`, null, `<button class="basic-button" onclick="controlnetShowPreview()">Preview</button>`));
            if (!currentBackendFeatureSet.includes('controlnetpreprocessors')) {
                controlnetGroup.append(createDiv(`controlnet_install_preprocessors`, 'keep_group_visible', `<button class="basic-button" onclick="installFeatureById('controlnet_preprocessors', 'controlnet_install_preprocessors')">Install Controlnet Preprocessors</button>`));
            }
        }
        let revisionGroup = document.getElementById('input_group_content_imageprompting');
        if (revisionGroup && !currentBackendFeatureSet.includes('ipadapter')) {
            revisionGroup.append(createDiv(`revision_install_ipadapter`, null, `<button class="basic-button" onclick="installFeatureById('ipadapter', 'revision_install_ipadapter')">Install IP Adapter</button>`));
        }
        let videoGroup = document.getElementById('input_group_content_imagetovideo');
        if (videoGroup && !currentBackendFeatureSet.includes('frameinterps')) {
            videoGroup.append(createDiv(`video_install_frameinterps`, 'keep_group_visible', `<button class="basic-button" onclick="installFeatureById('frame_interpolation', 'video_install_frameinterps')">Install Frame Interpolation</button>`));
        }
        let advancedSamplingGroup = document.getElementById('input_group_content_advancedsampling');
        if (advancedSamplingGroup && !currentBackendFeatureSet.includes('teacache')) {
            advancedSamplingGroup.append(createDiv(`advancedsampling_install_teacache`, 'keep_group_visible', `<button class="basic-button" onclick="installFeatureById('teacache', 'advancedsampling_install_teacache')">Install TeaCache</button>`));
        }
        for (let runnable of postParamBuildSteps) {
            runnable();
        }
        hideUnsupportableParams();
        let loras = document.getElementById('input_loras');
        if (loras) {
            reapplyLoraWeights();
        }
        if (imageEditor.active) {
            imageEditor.doParamHides();
        }
    };
    if (delay_final) {
        setTimeout(() => {
            final();
        }, 1);
    }
    else {
        final();
    }
}

function toggle_advanced() {
    let toggler = getRequiredElementById('advanced_options_checkbox');
    localStorage.setItem('display_advanced', toggler.checked);
    for (let param of gen_param_types) {
        if (param.toggleable) {
            doToggleEnable(`input_${param.id}`);
        }
    }
    hideUnsupportableParams();
}

function toggle_advanced_checkbox_manual() {
    let toggler = getRequiredElementById('advanced_options_checkbox');
    toggler.checked = !toggler.checked;
    toggle_advanced();
}

function getGenInput(input_overrides = {}, input_preoverrides = {}) {
    let input = JSON.parse(JSON.stringify(input_preoverrides));
    let extraMetadata = {};
    for (let type of gen_param_types) {
        if (type.toggleable && !getRequiredElementById(`input_${type.id}_toggle`).checked) {
            continue;
        }
        if (type.feature_missing) {
            continue;
        }
        let group = type.original_group || type.group;
        if (group && group.toggles && !getRequiredElementById(`input_group_content_${group.id}_toggle`).checked) {
            continue;
        }
        let elem = getRequiredElementById(`input_${type.id}`);
        let parent = findParentOfClass(elem, 'auto-input');
        if (parent && parent.dataset.disabled == 'true') {
            continue;
        }
        let val = getInputVal(elem);
        if (val != null) {
            input[type.id] = val;
        }
        if (type.type == 'image') {
            extraMetadata[`${type.id}_filename`] = elem.dataset.filename;
            extraMetadata[`${type.id}_resolution`] = elem.dataset.resolution;
        }
        if (type.id == 'prompt') {
            let container = findParentOfClass(elem, 'auto-input');
            let addedImageArea = container.querySelector('.added-image-area');
            if (addedImageArea) {
                addedImageArea.style.display = '';
                let imgs = [...addedImageArea.querySelectorAll('.alt-prompt-image')].filter(c => c.tagName == "IMG");
                if (imgs.length > 0) {
                    input["promptimages"] = imgs.map(img => img.dataset.filedata).join('|');
                }
            }
        }
    }
    for (let type of gen_param_types) {
        if (type.depend_non_default) {
            let otherParam = gen_param_types.find(p => p.id == type.depend_non_default);
            let otherElem = document.getElementById(`input_${otherParam.id}`);
            if (otherParam && otherElem && !otherElem.dataset.has_data && !(otherParam.id in input_overrides) && (!(otherParam.id in input) || input[otherParam.id] == otherParam.default)) {
                delete input[type.id];
            }
        }
    }
    if (!input['vae'] || input['vae'] == 'Automatic') {
        input['automaticvae'] = true;
        delete input['vae'];
    }
    let revisionImageArea = getRequiredElementById('alt_prompt_image_area');
    let revisionImages = [...revisionImageArea.querySelectorAll('.alt-prompt-image')].filter(c => c.tagName == "IMG");
    if (revisionImages.length > 0) {
        input["promptimages"] = revisionImages.map(img => img.dataset.filedata).join('|');
    }
    if (imageEditor.active) {
        extraMetadata["used_image_editor"] = "true";
        input["initimage"] = imageEditor.getFinalImageData();
        input["maskimage"] = imageEditor.getFinalMaskData();
        input["width"] = Math.floor(imageEditor.realWidth / 8) * 8;
        input["height"] = Math.floor(imageEditor.realHeight / 8) * 8;
        if (!input["initimagecreativity"]) {
            let param = document.getElementById('input_initimagecreativity');
            if (param) {
                input["initimagecreativity"] = param.value;
            }
            else {
                input["initimagecreativity"] = 0.6;
            }
        }
    }
    input["presets"] = currentPresets.map(p => p.title);
    for (let key in input_overrides) {
        let val = input_overrides[key];
        if (val == null) {
            delete input[key];
        }
        else {
            input[key] = input_overrides[key];
        }
    }
    input["extra_metadata"] = extraMetadata;
    return input;
}

function refreshParameterValues(strong = true, callback = null) {
    genericRequest('TriggerRefresh', {strong: strong}, data => {
        loadUserData();
        if (!gen_param_types) {
            return;
        }
        for (let param of data.list) {
            let origParam = gen_param_types.find(p => p.id == param.id);
            if (origParam) {
                origParam.values = param.values;
                origParam.value_names = param.value_names;
            }
        }
        updateAllModels(data.models);
        wildcardHelpers.newWildcardList(data.wildcards);
        let promises = [Promise.resolve(true)];
        for (let extra of refreshParamsExtra) {
            let promise = extra();
            promises.push(Promise.resolve(promise));
        }
        Promise.all(promises).then(() => {
            for (let param of gen_param_types) {
                let elem = document.getElementById(`input_${param.id}`);
                let presetElem = document.getElementById(`preset_input_${param.id}`);
                if (!elem) {
                    console.log(`Could not find element for param ${param.id}`);
                    continue;
                }
                let values = param.values;
                if (!values && param.type == "model") {
                    values = coreModelMap[param.subtype || 'Stable-Diffusion'].map(m => cleanModelName(m));
                }
                if ((param.type == "dropdown" || param.type == "model") && values) {
                    let val = elem.value;
                    let triggerChange = false;
                    if (elem.dataset.wantsValue && values.includes(elem.dataset.wantsValue)) {
                        val = elem.dataset.wantsValue;
                        triggerChange = true;
                        delete elem.dataset.wantsValue;
                    }
                    let html = '';
                    let alt_names = param['value_names'];
                    for (let i = 0; i < values.length; i++) {
                        let value = values[i];
                        let alt_name = alt_names && alt_names[i] ? alt_names[i] : value;
                        let selected = value == val ? ' selected="true"' : '';
                        let cleanName = htmlWithParen(alt_name);
                        html += `<option data-cleanname="${cleanName}" value="${escapeHtmlNoBr(value)}"${selected}>${cleanName}</option>\n`;
                    }
                    elem.innerHTML = html;
                    elem.value = val;
                    presetElem.innerHTML = html;
                    if (triggerChange) {
                        triggerChangeFor(elem);
                    }
                }
                else if (param.type == "list" && values) {
                    let listOpts = [...elem.options].map(o => o.value);
                    let newVals = values.filter(v => !listOpts.includes(v));
                    for (let val of newVals) {
                        $(elem).append(new Option(val, val, false, false));
                        $(presetElem).append(new Option(val, val, false, false));
                    }
                }
            }
            if (callback) {
                callback();
            }
            hideUnsupportableParams();
        });
    });
}

function setDirectParamValue(param, value, paramElem = null, forceDropdowns = false, doTrigger = true) {
    if (!paramElem) {
        paramElem = getRequiredElementById(`input_${param.id}`);
    }
    if (param.type == "boolean") {
        paramElem.checked = `${value}` == "true";
    }
    else if (param.type == "list" && paramElem.tagName == "SELECT") {
        let vals = typeof value == 'string' ? value.split(',').map(v => v.trim()) : value;
        for (let val of vals) {
            if (val && !$(paramElem).find(`option[value="${val}"]`).length) {
                $(paramElem).append(new Option(val, val, false, false));
            }
        }
        $(paramElem).val(vals);
        $(paramElem).trigger('change');
    }
    else if (param.type == "image" || param.type == "image_list") {
        // do not edit images directly, this will just misbehave
    }
    else if (paramElem.tagName == "SELECT") {
        if (![...paramElem.querySelectorAll('option')].map(o => o.value).includes(value)) {
            if (!forceDropdowns) {
                paramElem.dataset.wantsValue = value;
                return;
            }
            paramElem.add(new Option(`${value} (Invalid)`, value, false, false));
        }
        paramElem.value = value;
    }
    else if (param.type == "integer" || param.type == "decimal") {
        paramElem.value = value;
        if (!doTrigger) {
            let range = document.getElementById(`input_${param.id}_rangeslider`);
            if (range && range.oninput) {
                range.value = value;
                range.oninput({srcElement: range});
            }
        }
    }
    else {
        paramElem.value = value;
    }
    if (doTrigger) {
        triggerChangeFor(paramElem);
    }
}

function resetParamsToDefault(exclude = [], doDefaultPreset = true) {
    for (let cookie of listCookies('lastparam_')) {
        if (!exclude.includes(cookie.substring('lastparam_'.length))) {
            deleteCookie(cookie);
        }
    }
    for (let cookie of listCookies('group_toggle_')) {
        deleteCookie(cookie);
    }
    for (let cookie of listCookies('group_open_')) {
        deleteCookie(cookie);
    }
    localStorage.removeItem('last_comfy_workflow_input');
    for (let box of ['alt_prompt_textbox', 'alt_negativeprompt_textbox']) {
        let elem = getRequiredElementById(box);
        elem.value = '';
        triggerChangeFor(elem);
    }
    for (let param of gen_param_types) {
        if (param.id != 'model' && !exclude.includes(param.id)) {
            let id = `input_${param.id}`;
            let elem = document.getElementById(id);
            if (elem != null) {
                setDirectParamValue(param, param.default, elem, false, false);
                if (param.toggleable) {
                    let toggler = getRequiredElementById(`${id}_toggle`);
                    if (!toggler.checked) {
                        continue;
                    }
                    toggler.checked = false;
                    triggerChangeFor(toggler);
                    continue;
                }
                if (param.group && param.group.toggles) {
                    let toggler = document.getElementById(`input_group_content_${param.group.id}_toggle`);
                    if (toggler) {
                        if (!toggler.checked) {
                            continue;
                        }
                        toggler.checked = false;
                        doToggleGroup(`input_group_content_${param.group.id}`);
                        continue;
                    }
                }
                triggerChangeFor(elem);
            }
        }
    }
    let aspect = document.getElementById('input_aspectratio');
    if (aspect) { // Fix resolution trick incase the reset broke it
        triggerChangeFor(aspect);
    }
    currentModelChanged();
    clearPresets();
    let defaultPreset = getPresetByTitle('default');
    if (defaultPreset && doDefaultPreset) {
        applyOnePreset(defaultPreset);
    }
    hideUnsupportableParams();
}

function hideUnalteredParameters() {
    let filterBox = getRequiredElementById('main_inputs_filter');
    let filter = filterBox.value.toLowerCase();
    if (filter.includes('<unaltered>')) {
        filter = filter.replaceAll('<unaltered>', '');
    }
    else {
        filter += '<unaltered>';
    }
    filterBox.value = filter;
    hideUnsupportableParams();
}

/** Callbacks to run after hideUnsupportableParams, to do extra logic for showing/hiding specific params.
 * Called as `callback(groups)`, where `groups` is an object mapping group IDs to `{ visible: 0, data: param.group, altered: 0 }`.
 */
let hideParamCallbacks = [];

function hideUnsupportableParams() {
    if (!gen_param_types) {
        return;
    }
    let ipadapterInstallButton = document.getElementById('revision_install_ipadapter');
    if (ipadapterInstallButton && currentBackendFeatureSet.includes('ipadapter')) {
        ipadapterInstallButton.remove();
    }
    let controlnetInstallButton = document.getElementById('controlnet_install_preprocessors');
    if (controlnetInstallButton && currentBackendFeatureSet.includes('controlnetpreprocessors')) {
        controlnetInstallButton.remove();
    }
    let videoFrameInterpInstallButton = document.getElementById('video_install_frameinterps');
    if (videoFrameInterpInstallButton && currentBackendFeatureSet.includes('frameinterps')) {
        videoFrameInterpInstallButton.remove();
    }
    let teaCacheInstallButton = document.getElementById('advancedsampling_install_teacache');
    if (teaCacheInstallButton && currentBackendFeatureSet.includes('teacache')) {
        teaCacheInstallButton.remove();
    }
    let filter = getRequiredElementById('main_inputs_filter').value.toLowerCase();
    let hideUnaltered = filter.includes('<unaltered>');
    if (hideUnaltered) {
        filter = filter.replaceAll('<unaltered>', '');
    }
    let filterClearer = getRequiredElementById('clear_input_icon');
    filterClearer.style.display = filter.length > 0 ? 'block' : 'none';
    let groups = {};
    let advancedCount = 0;
    let advancedToggler = getRequiredElementById('advanced_options_checkbox');
    let showAdvanced = advancedToggler.checked;
    for (let param of gen_param_types) {
        let elem = document.getElementById(`input_${param.id}`);
        if (elem) {
            let box = findParentOfClass(elem, 'auto-input');
            let supported = param.feature_flag == null || param.feature_flag.split(',').every(f => currentBackendFeatureSet.includes(f));
            let filterShow = true;
            if (filter && param.id != 'prompt') {
                let searchText = `${param.id} ${param.name} ${param.description} ${param.group ? param.group.name : ''}`.toLowerCase();
                filterShow = searchText.includes(filter);
            }
            param.feature_missing = !supported;
            let show = supported && param.visible;
            let paramToggler = document.getElementById(`input_${param.id}_toggle`);
            let isAltered = paramToggler ? paramToggler.checked : `${getInputVal(elem)}` != param.default;
            let group = param.original_group || param.group;
            if (group && group.toggles && !getRequiredElementById(`input_group_content_${group.id}_toggle`).checked) {
                isAltered = false;
            }
            if (box && box.style.display == 'none' && box.dataset.visible_controlled) {
                isAltered = false;
            }
            if (hideUnaltered && !isAltered) {
                show = false;
            }
            let isAdvanced = param.advanced || (param.group && param.group.advanced && !groupAdvancedOverrides[param.group.id]);
            if (isAdvanced && !showAdvanced && !isAltered) {
                show = false;
            }
            if (!filterShow) {
                show = false;
            }
            if (param.depend_non_default) {
                let otherParam = gen_param_types.find(p => p.id == param.depend_non_default);
                let other = document.getElementById(`input_${param.depend_non_default}`);
                if (other && !other.dataset.has_data) {
                    if (getInputVal(other) == otherParam.default) {
                        show = false;
                    }
                    else {
                        let otherToggler = document.getElementById(`input_${otherParam.id}_toggle`);
                        if (otherToggler && !otherToggler.checked) {
                            show = false;
                        }
                        else {
                            let otherGroup = otherParam.original_group || otherParam.group;
                            if (otherGroup && otherGroup.toggles && !getRequiredElementById(`input_group_content_${otherGroup.id}_toggle`).checked) {
                                show = false;
                            }
                        }
                    }
                }
            }
            if (param.advanced && supported && filterShow) {
                advancedCount++;
            }
            if (!box.dataset.visible_controlled) {
                box.style.display = show ? '' : 'none';
            }
            box.dataset.disabled = supported ? 'false' : 'true';
            if (param.group) {
                let groupData = groups[param.group.id] || { visible: 0, data: param.group, altered: 0 };
                groups[param.group.id] = groupData;
                if (show) {
                    groupData.visible++;
                    if (isAltered) {
                        groupData.altered++;
                    }
                }
            }
        }
    }
    for (let callback of hideParamCallbacks) {
        callback(groups);
    }
    getRequiredElementById('advanced_hidden_count').innerText = `(${advancedCount})`;
    for (let group in groups) {
        let groupData = groups[group];
        let groupElem = getRequiredElementById(`auto-group-${group}`);
        let visible = false;
        if (groupData.visible > 0) {
            visible = true;
        }
        else if (groupElem.querySelector('.keep_group_visible') && filter == "") {
            if (!groupData.data.advanced || showAdvanced) {
                visible = true;
            }
        }
        if (visible) {
            groupElem.style.display = 'block';
        }
        else {
            groupElem.style.display = 'none';
        }
        let counter = groupElem.querySelector('.header-label-counter');
        if (counter) {
            counter.dataset.count = groupData.altered;
            counter.innerText = groupData.altered == 0 ? '' : ` ${groupData.altered}`;
            if (visible && groupData.data.advanced && !showAdvanced) {
                counter.title = groupData.altered == 0 ? '' : `${groupData.altered} altered parameters in this hidden advanced group`;
            }
            else {
                counter.title = groupData.altered == 0 ? '' : `${groupData.altered} altered parameters in this group`;
            }
            if (visible && groupData.data.advanced && !showAdvanced && groupData.altered > 0) {
                counter.classList.add('header-label-counter-advancedshine');
            }
            else {
                counter.classList.remove('header-label-counter-advancedshine');
            }
        }
    }
}

/**
 * Returns a sorted list of parameters, with the parameters in the order of top, then groupless, then otherParams, then all remaining grouped.
 * Within each section, parameters are sorted by group priority, then group id, then parameter priority, then parameter id.
 */
function sortParameterList(params, top = [], otherParams = []) {
    function sortFunc(a, b) {
        if (a.group != null && b.group != null) {
            if (a.group.priority != b.group.priority) {
                return a.group.priority - b.group.priority;
            }
            if (a.group.id != b.group.id) {
                return a.group.id.localeCompare(b.group.id);
            }
        }
        if (a.priority != b.priority) {
            return a.priority - b.priority;
        }
        return a.id.localeCompare(b.id);
    }
    let first = params.filter(p => p.always_first).sort(sortFunc);
    let prims = params.filter(p => p.group == null && !p.always_first).sort(sortFunc);
    let others = params.filter(p => p.group != null && !p.always_first).sort(sortFunc);
    return first.concat(top).concat(prims).concat(otherParams).concat(others);
}

function buildParameterList(params, groups) {
    let groupMap = {};
    for (let group of groups) {
        groupMap[group.id] = group;
    }
    for (let group of groups) {
        if (group.parent) {
            group.parent = groupMap[group.parent];
        }
    }
    for (let param of params) {
        if (param.group) {
            param.group = groupMap[param.group];
        }
    }
    return [sortParameterList(params), groupMap];
}

/** Returns a copy of the parameter name, cleaned for ID format input. */
function cleanParamName(name) {
    return name.toLowerCase().replaceAll(/[^a-z]/g, '');
}

/** Sets the value of a parameter to the value used in the currently selected image, if any. (eg for seeds, not the 'reuse parameters' button.) */
function reuseLastParamVal(paramId) {
    if (!currentMetadataVal) {
        return;
    }
    let pid;
    if (paramId.startsWith("input_")) {
        pid = paramId.substring("input_".length);
    }
    else if (paramId.startsWith("preset_input_")) {
        pid = paramId.substring("preset_input_".length);
    }
    else {
        return;
    }
    let params = JSON.parse(currentMetadataVal).sui_image_params;
    if (pid in params) {
        let elem = getRequiredElementById(paramId);
        elem.value = params[pid];
        triggerChangeFor(elem);
    }
}

/** Internal debug function to show the hidden params. */
function debugShowHiddenParams() {
    for (let id of ['main_inputs_area_hidden', 'simple_inputs_area_hidden']) {
        let hiddenArea = getRequiredElementById(id);
        hiddenArea.style.display = 'block';
        hiddenArea.style.visibility = 'visible';
    }
    for (let param of gen_param_types) {
        let elem = document.getElementById(`input_${param.id}`);
        if (elem) {
            let box = findParentOfClass(elem, 'auto-input');
            box.style.display = '';
        }
    }
}

/** Loads and shows a preview of ControlNet preprocessing to the user. */
function controlnetShowPreview() {
    let toggler = getRequiredElementById('input_group_content_controlnet_toggle');
    if (!toggler.checked) {
        toggler.checked = true;
        doToggleGroup('input_group_content_controlnet');
    }
    setCurrentModel(() => {
        if (getRequiredElementById('current_model').value == '') {
            showError("Cannot generate, no model selected.");
            return;
        }
        let previewArea = getRequiredElementById('controlnet_button_preview');
        let clearPreview = () => {
            let lastResult = previewArea.querySelector('.controlnet-preview-result');
            if (lastResult) {
                lastResult.remove();
            }
        };
        clearPreview();
        let imgInput = getRequiredElementById('input_controlnetimageinput');
        if (!imgInput || !imgInput.dataset.filedata) {
            let secondaryImageOption = getRequiredElementById('input_initimage');
            if (!secondaryImageOption || !secondaryImageOption.dataset.filedata) {
                clearPreview();
                previewArea.append(createDiv(null, 'controlnet-preview-result', 'Must select an image.'));
                return;
            }
        }
        let genData = getGenInput();
        genData['images'] = 1;
        genData['prompt'] = '';
        delete genData['batchsize'];
        genData['donotsave'] = true;
        genData['controlnetpreviewonly'] = true;
        makeWSRequestT2I('GenerateText2ImageWS', genData, data => {
            if (!data.image) {
                return;
            }
            let imgElem = document.createElement('img');
            imgElem.src = data.image;
            let resultBox = createDiv(null, 'controlnet-preview-result');
            resultBox.append(imgElem);
            clearPreview();
            previewArea.append(resultBox);
        });
    });
}

/** Gets the parameter with a given ID, from either the current param set, or the raw set from server. If unavailable, returns null. */
function getParamById(id) {
    if (!gen_param_types) {
        return null;
    }
    let param = gen_param_types.find(p => p.id == id);
    if (!param) {
        param = rawGenParamTypesFromServer.find(p => p.id == id);
    }
    return param;
}

/** Adds a button to the given group to install a feature. */
function addInstallButton(groupId, featureId, installId, buttonText) {
    postParamBuildSteps.push(() => {
        let targetGroup = document.getElementById(`input_group_content_${groupId}`);
        if (targetGroup && !currentBackendFeatureSet.includes(featureId)) {
            targetGroup.append(createDiv(`${groupId}_${installId}_install_button`, 'keep_group_visible', `<button class="basic-button" onclick="installFeatureById('${installId}', '${groupId}_${installId}_install_button')">${buttonText}</button>`));
        }
    });
    hideParamCallbacks.push(() => {
        if (currentBackendFeatureSet.includes(featureId)) {
            let installButton = document.getElementById(`${groupId}_${installId}_install_button`);
            if (installButton) {
                installButton.remove();
            }
        }
    });
}
