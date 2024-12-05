
/** Handler for tab-completes in prompt boxes. */
class PromptTabCompleteClass {
    constructor() {
        this.prefixes = {
        };
        this.registerPrefix('random', 'Select from a set of random words to include', (prefix) => {
            return ['\nSpecify a comma-separated list of words to choose from, like "<random:cat,dog,elephant>".', '\nYou can use "||" instead of "," if you need to include commas in your values.', '\nYou can use eg "1-5" to pick a random number in a range.'];
        });
        this.registerPrefix('random[2-4]', 'Selects multiple options from a set of random words to include', (prefix) => {
            return ['\nSpecify a comma-separated list of words to choose from, like "<random[2]:cat,dog,elephant>".', '\nYou can use "||" instead of "," if you need to include commas in your values. You can use eg "1-5" to pick a random number in a range.', '\nPut a comma in the input (eg "random[2,]:") to make the output have commas too.'];
        });
        this.registerPrefix('alternate', 'Cause multiple different words or phrases to be alternated between.', (prefix) => {
            return ['\nSpecify a comma-separated list of words to choose from, like "<alternate:cat,dog>".', '\nYou can use "||" instead of "," if you need to include commas in your values.'];
        });
        this.registerPrefix('fromto[0.5]', 'Have the prompt change after a given timestep.', (prefix) => {
            return ['\nSpecify in the brackets a timestep like 10 (for step 10) or 0.5 (for halfway through).', '\nIn the data area specify the before and the after separate by "," or "|".', '\nFor example, "<fromto[10]:cat,dog>" switches from "cat" to "dog" at step 10.'];
        });
        this.registerPrefix('wildcard', 'Select a random line from a wildcard file (presaved list of options)', (prefix) => {
            let prefixLow = prefix.toLowerCase();
            return this.getOrderedMatches(allWildcards, prefixLow);
        });
        this.registerAltPrefix('wc', 'wildcard');
        this.registerPrefix('wildcard[2-4]', 'Select multiple random lines from a wildcard file (presaved list of options) (works same as "random" but for wildcards)', (prefix) => {
            let prefixLow = prefix.toLowerCase();
            return this.getOrderedMatches(allWildcards, prefixLow);
        });
        this.registerPrefix('repeat[3]', 'Repeat a value several times', (prefix) => {
            return ['\nUse for example like "<repeat[3]:very> big" to get "very very very big",', '\nor "<repeat[1-3]:very>" to get randomly between 1 to 3 "very"s,', '\nor <repeat[3]:<random:cat,dog>>" to get "cat" or "dog" 3 times in a row eg "cat dog cat".'];
        });
        this.registerPrefix('preset', 'Forcibly apply a preset onto the current generation (useful eg inside wildcards or other automatic inclusions - normally use the Presets UI tab)', (prefix) => {
            let prefixLow = prefix.toLowerCase();
            return this.getOrderedMatches(allPresets.map(p => p.title), prefixLow);
        });
        this.registerAltPrefix('p', 'preset');
        this.registerPrefix('embed', 'Use a pretrained CLIP TI Embedding', (prefix) => {
            let prefixLow = prefix.toLowerCase();
            return this.getOrderedMatches(coreModelMap['Embedding'].map(cleanModelName), prefixLow);
        });
        this.registerAltPrefix('embedding', 'embed');
        this.registerPrefix('lora', 'Forcibly apply a pretrained LoRA model (useful eg inside wildcards or other automatic inclusions - normally use the LoRAs UI tab)', (prefix) => {
            let prefixLow = prefix.toLowerCase();
            return this.getOrderedMatches(coreModelMap['LoRA'].map(cleanModelName), prefixLow);
        });
        this.registerPrefix('region', 'Apply a different prompt to a sub-region within the image', (prefix) => {
            return ['\nx,y,width,height eg "0.25,0.25,0.5,0.5"', '\nor x,y,width,height,strength eg "0,0,1,1,0.5"', '\nwhere strength is how strongly to apply the prompt to the region (vs global prompt). Can do "region:background" for background-only region.'];
        });
        this.registerPrefix('object', 'Select a sub-region inside the image and inpaint over it with a different prompt', (prefix) => {
            return ['\nx,y,width,height eg "0.25,0.25,0.5,0.5"', '\nor x,y,width,height,strength,strength2 eg "0,0,1,1,0.5,0.4"', '\nwhere strength is how strongly to apply the prompt to the region (vs global prompt) on the general pass, and strength2 is how strongly to inpaint (ie InitImageCreativity).'];
        });
        this.registerPrefix('segment', 'Automatically segment an area by CLIP matcher and inpaint it (optionally with a unique prompt)', (prefix) => {
            let prefixLow = prefix.toLowerCase();
            if (prefixLow.startsWith('yolo-')) {
                let modelList = rawGenParamTypesFromServer.filter(p => p.id == 'yolomodelinternal');
                if (modelList && modelList.length > 0) {
                    let yolomodels = modelList[0].values;
                    return this.getOrderedMatches(yolomodels.map(m => `yolo-${m}`), prefixLow);
                }
            }
            return ['\nSpecify before the ">" some text to match against in the image, like "<segment:face>".', '\nCan also do "<segment:text,creativity,threshold>" eg "face,0.6,0.5" where creativity is InitImageCreativity, and threshold is mask matching threshold for CLIP-Seg.', '\nYou can use a negative threshold value like "<segment:face,0.6,-0.5>" to invert the mask.', '\nYou may use the "yolo-" prefix to use a YOLOv8 seg model,', '\nor format "yolo-<model>-1" to get specifically the first result from a YOLOv8 match list.'];
        });
        this.registerPrefix('setvar[var_name]', 'Store text for reference later in the prompt', (prefix) => { 
            return ['\nSave the content of the tag into the named variable. eg "<setvar[colors]: red and blue>", then use like "<var:colors>"', '\nVariables can include the results of other tags. eg "<setvar[expression]: <random: smiling|frowning|crying>>"', '\nReference stored values later in the prompt with the <var:> tag'];
        });
        this.registerPrefix('var', 'Reference a previously saved variable later', (prefix, prompt) => {
            let prefixLow = prefix.toLowerCase();
            let possible = [];
            let matches = prompt.match(/<setvar\[(.*?)\]:/g);
            if (matches) {
                for (let match of matches) {
                    let varName = match.substring('<setvar['.length, match.length - ']:'.length);
                    if (varName.toLowerCase().includes(prefixLow)) {
                        possible.push(varName);
                    }
                }
            }
            if (possible.length == 0) {
                return ['\nRecall a value previously saved with <setvar[name]:...>, use like "<var:name>"','\n"setvar" must be used earlier in the prompt, then "var" later'];
            }
            return possible;
        });
        this.registerPrefix('clear', 'Automatically clear part of the image to transparent (by CLIP segmentation matching) (iffy quality, prefer the Remove Background parameter over this)', (prefix) => {
            return ['\nSpecify before the ">" some text to match against in the image, like "<segment:background>"'];
        });
        this.registerPrefix('break', 'Split this prompt across multiple lines of conditioning to the model (helps separate concepts for long prompts).', (prefix) => {
            return [];
        }, true);
        this.registerPrefix('trigger', "Automatically fills with the current model or LoRA's trigger phrase(s), if any.", (prefix) => {
            return [];
        }, true);
        this.lastWord = null;
        this.lastResults = null;
        this.blockInput = false;
    }

    getOrderedMatches(set, prefixLow) {
        let matched = set.filter(m => m.toLowerCase().includes(prefixLow));
        let prefixed = matched.filter(m => m.toLowerCase().startsWith(prefixLow));
        let suffixed = matched.filter(m => !m.toLowerCase().startsWith(prefixLow));
        return prefixed.concat(suffixed);
    }

    enableFor(box) {
        box.addEventListener('keydown', e => this.onKeyDown(e), true);
        box.addEventListener('input', () => this.onInput(box), true);
    }

    registerPrefix(name, description, completer, selfStanding = false) {
        this.prefixes[name] = { name, description, completer, selfStanding, isAlt: false };
    }

    registerAltPrefix(name, copyFrom) {
        let data = this.prefixes[copyFrom];
        this.prefixes[name] = { name, description: data.description, completer: data.completer, selfStanding: data.selfStanding, isAlt: true };
    }

    getPromptBeforeCursor(box) {
        return box.value.substring(0, box.selectionStart);
    }

    findLastWordIndex(text) {
        let index = -1;
        for (let cut of [' ', ',', '.', '\n']) {
            let i = text.lastIndexOf(cut);
            if (i > index) {
                index = i;
            }
        }
        return index + 1;
    }

    getPossibleList(box) {
        let prompt = this.getPromptBeforeCursor(box);
        let word = prompt.substring(this.findLastWordIndex(prompt));
        let baseList = [];
        if (word.length > 1 && autoCompletionsList) {
            let completionSet;
            if (this.lastWord && word.startsWith(this.lastWord)) {
                completionSet = this.lastResults;
            }
            else {
                completionSet = autoCompletionsOptimize ? autoCompletionsList[word[0]] : autoCompletionsList['all'];
            }
            let wordLow = word.toLowerCase();
            let rawMatchSet = [];
            if (completionSet) {
                let startWithList = [];
                let containList = [];
                for (let i = 0; i < completionSet.length; i++) {
                    let entry = completionSet[i];
                    if (entry.low.includes(wordLow)) {
                        if (entry.low.startsWith(wordLow)) {
                            startWithList.push(entry);
                        }
                        else {
                            containList.push(entry);
                        }
                        rawMatchSet.push(entry);
                    }
                }
                let sortMode = getUserSetting('autocomplete.sortmode');
                let doSortList = (list) => {
                    if (sortMode == 'Active') {
                        list.sort((a, b) => a.low.length - b.low.length || a.low.localeCompare(b.low));
                    }
                    else if (sortMode == 'Alphabetical') {
                        list.sort((a, b) => a.low.localeCompare(b.low));
                    }
                    else if (sortMode == 'Frequency') {
                        list.sort((a, b) => b.count - a.count);
                    }
                    // else 'None'
                }
                let matchMode = getUserSetting('autocomplete.matchmode');
                if (matchMode == 'Bucketed') {
                    doSortList(startWithList);
                    doSortList(containList);
                    baseList = startWithList.concat(containList);
                }
                else if (matchMode == 'Contains') {
                    doSortList(rawMatchSet);
                    baseList = rawMatchSet;
                }
                else if (matchMode == 'StartsWith') {
                    doSortList(startWithList);
                    baseList = startWithList;
                }
                if (baseList.length > 50) {
                    baseList = baseList.slice(0, 50);
                }
            }
            this.lastWord = word;
            this.lastResults = rawMatchSet;
        }
        let lastBrace = prompt.lastIndexOf('<');
        if (lastBrace == -1) {
            return baseList;
        }
        let lastClose = prompt.lastIndexOf('>');
        if (lastClose > lastBrace) {
            return baseList;
        }
        let content = prompt.substring(lastBrace + 1);
        let colon = content.indexOf(':');
        if (colon == -1) {
            content = content.toLowerCase();
            return Object.keys(this.prefixes).filter(p => p.toLowerCase().startsWith(content) && !this.prefixes[p].isAlt).map(p => [p, this.prefixes[p].description]);
        }
        let prefix = content.substring(0, colon);
        let suffix = content.substring(colon + 1);
        if (!(prefix in this.prefixes)) {
            return [];
        }
        return this.prefixes[prefix].completer(suffix, prompt).map(p => p.startsWith('\n') ? p : `<${prefix}:${p}>`);
    }

    onKeyDown(e) {
        // block pageup/down because chrome is silly
        if (e.keyCode == 33 || e.keyCode == 34) {
            e.preventDefault();
        }
        if (this.popover) {
            this.popover.onKeyDown(e);
            if (this.popover && (e.key == 'Tab' || e.key == 'Enter')) {
                this.popover.remove();
                this.popover = null;
                this.blockInput = true;
                setTimeout(() => {
                    this.blockInput = false;
                    this.onInput(e.target);
                }, 10);
            }
        }
    }

    onInput(box) {
        if (this.blockInput) {
            return;
        }
        if (this.popover) {
            this.popover.remove();
            this.popover = null;
        }
        let possible = this.getPossibleList(box);
        if (possible.length == 0) {
            return;
        }
        let buttons = [];
        let prompt = this.getPromptBeforeCursor(box);
        let lastBrace = prompt.lastIndexOf('<');
        let wordIndex = this.findLastWordIndex(prompt);
        for (let val of possible) {
            let name = val;
            let clean_name = null;
            let desc = '';
            let apply = name;
            let isClickable = true;
            let index = lastBrace;
            let className = null;
            if (typeof val == 'object') {
                if (val.raw) {
                    name = val.name || '';
                    desc = val.desc || '';
                    if (val.clean) {
                        clean_name = val.clean;
                    }
                    if (val.tag) {
                        className = `tag-text tag-type-${val.tag}`;
                    }
                    if (val.count_display) {
                        desc = `${desc} ${val.count_display}`.trim();
                    }
                    apply = name;
                    index = wordIndex;
                }
                else {
                    [name, desc] = val;
                    if (this.prefixes[name].selfStanding) {
                        apply = `<${name}>`;
                    }
                    else {
                        apply = `<${name}:`;
                    }
                }
            }
            else if (val.startsWith('\n')) {
                isClickable = false;
                name = '';
                desc = val.substring(1);
            }
            let button = { key: name, className: className };
            if (desc) {
                button.key_html = `${escapeHtml(clean_name || name)} <span class="parens">- ${escapeHtml(desc)}</span>`;
            }
            else {
                button.key_html = escapeHtml(clean_name || name);
            }
            if (isClickable) {
                button.action = () => {
                    let areaPre = prompt.substring(0, index);
                    let areaPost = box.value.substring(box.selectionStart);
                    box.value = areaPre + apply + areaPost;
                    box.selectionStart = areaPre.length + apply.length;
                    box.selectionEnd = areaPre.length + apply.length;
                    box.focus();
                    box.dispatchEvent(new Event('input'));
                };
            }
            buttons.push(button);
        }
        let rect = box.getBoundingClientRect();
        this.popover = new AdvancedPopover('prompt_suggest', buttons, false, rect.x, rect.y + box.offsetHeight + 6, box.parentElement, null, box.offsetHeight + 6, 250);
    }
}

let promptTabComplete = new PromptTabCompleteClass();

/** Handler for the plus button next to the prompt box and the connected features. */
class PromptPlusButton {
    constructor() {
        this.altTextBox = getRequiredElementById('alt_prompt_textbox');
        this.addButton = getRequiredElementById('alt_text_add_button');
        this.addButton.addEventListener('click', () => this.showMenu());
        this.popover = null;
        this.segmentModalOther = getRequiredElementById('text_prompt_segment_other_inputs');
        this.segmentModalOther.innerHTML =
            makeGenericPopover('text_prompt_segment_model', 'Prompt Syntax: Segment Model', 'Model', "What model to find the segment with.\nBy default, CLIP-Seg is a special model that uses text prompt matching.\nYou may instead use a YOLOv8 model.", '')
            + makeDropdownInput(null, 'text_prompt_segment_model', '', 'Segment Model', '', ['CLIP-Seg'], 'CLIP-Seg', false, true, ['CLIP-Seg (Match by prompting)'])
            + makeGenericPopover('text_prompt_segment_textmatch', 'Prompt Syntax: Segment Text Match', 'Text', "The text to match against in the image.\nDoesn't apply when using a YOLO model.\nFor example, 'face' or 'the man's face'", '')
            + makeTextInput(null, 'text_prompt_segment_textmatch', '', 'Text Match', '', '', 'normal', '', false, false, true)
            + makeGenericPopover('text_prompt_segment_creativity', 'Prompt Syntax: Segment Creativity', 'Number', 'How creative the model should be when rebuilding this segment.\nAlso known as denoising strength.\n0 makes no changes, 1 completely replaces the area.', '')
            + makeSliderInput(null, 'text_prompt_segment_creativity', '', 'Creativity', '', 0.6, 0, 1, 0, 1, 0.05, false, false, true)
            + makeGenericPopover('text_prompt_segment_threshold', 'Prompt Syntax: Segment Threshold', 'Number', 'The limit that defines that "minimum match quality" for the model to consider this segment matched.\nAt 0 this will include too much, at 1 this will include too little or nothing.', '')
            + makeSliderInput(null, 'text_prompt_segment_threshold', '', 'Threshold', '', 0.5, 0, 1, 0, 1, 0.05, false, false, true)
            + makeGenericPopover('text_prompt_segment_invert_mask', 'Prompt Syntax: Segment Invert Mask', 'Checkbox', 'Whether to invert the mask.\nIf checked, select everything except what was matched by the model.', '')
            + makeCheckboxInput(null, 'text_prompt_segment_invert_mask', '', 'Invert Mask', '', false, false, false, true)
            + makeGenericPopover('text_prompt_segment_gentext', 'Prompt Syntax: Segment Generation Prompt', 'text', 'The prompt to use when regenerating the matched area.\nShould be a full text on its own, can use a subset of general prompting syntax.', '')
            + makeTextInput(null, 'text_prompt_segment_gentext', '', 'Generation Prompt', '', '', 'prompt', 'Type your generation prompt here...', false, false, true);
        this.segmentModalModelSelect = getRequiredElementById('text_prompt_segment_model');
        this.segmentModalModelSelect.addEventListener('change', () => this.segmentModalProcessChanges());
        this.segmentModalTextMatch = getRequiredElementById('text_prompt_segment_textmatch');
        this.segmentModalCreativity = getRequiredElementById('text_prompt_segment_creativity');
        this.segmentModalThreshold = getRequiredElementById('text_prompt_segment_threshold');
        this.segmentModalInvertMask = getRequiredElementById('text_prompt_segment_invert_mask');
        this.segmentModalMainText = getRequiredElementById('text_prompt_segment_gentext');
        textPromptAddKeydownHandler(this.segmentModalMainText);
        enableSlidersIn(this.segmentModalOther);
    }

    autoHideMenu() {
        if (this.popover) {
            this.popover.remove();
            this.popover = null;
        }
    }

    showMenu() {
        this.autoHideMenu();
        let buttons = [];
        buttons.push({ key: 'segment', key_html: 'Auto Segment Refinement', title: "Automatically segment and refine part of an image (eg clean up a face)", action: () => {
            this.autoHideMenu();
            this.segmentModalClear();
            this.segmentModalProcessChanges();
            $('#text_prompt_segment_modal').modal('show');
        }});
        buttons.push({ key: 'other', key_html: 'Other...', title: "Add some other prompt syntax (that doesn't have its own menu)", action: () => {
            let text = this.altTextBox.value.trim();
            if (!text.endsWith('<')) {
                text += ' <';
            }
            this.altTextBox.value = text;
            this.altTextBox.selectionStart = this.altTextBox.value.length;
            this.altTextBox.selectionEnd = this.altTextBox.value.length;
            this.altTextBox.focus();
            triggerChangeFor(this.altTextBox);
        }});
        let rect = this.addButton.getBoundingClientRect();
        this.popover = new AdvancedPopover('prompt_plus_menu', buttons, true, rect.x, rect.y + this.addButton.offsetHeight + 6, this.addButton.parentElement, null, this.addButton.offsetHeight + 6, 250);
    }

    segmentModalClear() {
        let html = '<option value="CLIP-Seg">CLIP-Seg (Match by prompting)</option>\n';
        let modelList = rawGenParamTypesFromServer.filter(p => p.id == 'yolomodelinternal');
        if (modelList && modelList.length > 0) {
            let yolomodels = modelList[0].values;
            for (let model of yolomodels) {
                html += `<option value="yolo-${model}">${model} (YOLOv8)</option>\n`;
            }
        }
        this.segmentModalModelSelect.innerHTML = html;
        this.segmentModalModelSelect.value = 'CLIP-Seg';
        this.segmentModalMainText.value = '';
        this.segmentModalCreativity.value = 0.6;
        this.segmentModalThreshold.value = 0.5;
        this.segmentModalTextMatch.value = '';
        this.segmentModalInvertMask.checked = false;
    }

    segmentModalProcessChanges() {
        if (this.segmentModalModelSelect.value == 'CLIP-Seg') {
            this.segmentModalTextMatch.disabled = false;
            let text = translate("Text to match against in the image");
            this.segmentModalTextMatch.placeholder = text;
            this.segmentModalTextMatch.title = text;
        }
        else {
            this.segmentModalTextMatch.disabled = true;
            let text = translate("Text match is disabled because you are not using CLIP-Seg");
            this.segmentModalTextMatch.placeholder = text;
            this.segmentModalTextMatch.title = text;
        }
    }

    segmentModalSubmit() {
        let modelText = this.segmentModalModelSelect.value;
        if (modelText == "CLIP-Seg") {
            modelText = this.segmentModalTextMatch.value.trim();
        }
        $('#text_prompt_segment_modal').modal('hide');
        this.applyNewSyntax(`\n<segment:${modelText},${this.segmentModalCreativity.value},${this.segmentModalInvertMask.checked ? '-' : ''}${this.segmentModalThreshold.value}> ${this.segmentModalMainText.value.trim()}`);
    }

    applyNewSyntax(text) {
        this.altTextBox.value = (this.altTextBox.value.trim() + text.trim()).trim();
        triggerChangeFor(this.altTextBox);
        this.altTextBox.selectionStart = this.altTextBox.value.length;
        this.altTextBox.selectionEnd = this.altTextBox.value.length;
        this.altTextBox.focus();
    }
}

let promptPlusButton = new PromptPlusButton();
