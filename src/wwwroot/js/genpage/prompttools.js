
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
        this.registerPrefix('extend', 'Use an Image2Video model to extend a video repeatedly', (prefix) => {
            return ['\nInput is a frame count, also follow this tag with a prompt for the section.\nFor example, "<extend:81> the cat runs" to add an 81 frame clip of your cat running.\nSee also the "Video Extend" parameter group.'];
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
            return ['\nSpecify before the ">" some text to match against in the image, like "<segment:face>".', '\nCan also do "<segment:text,creativity,threshold>" eg "face,0.6,0.5" where creativity is InitImageCreativity, and threshold is mask matching threshold for CLIP-Seg.', '\nYou can use a negative threshold value like "<segment:face,0.6,-0.5>" to invert the mask.', '\nYou may use the "yolo-" prefix to use a YOLOv8 seg model,', '\nor format "yolo-<model>-1" to get specifically the first result from a YOLOv8 match list.', '\n Additionally, you can apply a class filter by appending "yolo-<model>:<class_ids>:" where <class_ids> is a comma-separated list of class IDs or names to filter the detection results.'];
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
        this.registerPrefix('comment', "Add a discarded personal comment. Will not be treated as part of the 'real prompt'.", (prefix) => {
            return ['\nThis is a personal comment, write a note to yourself.'];
        });
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
        this.noOverlap = false;
        this.segmentModalOther = getRequiredElementById('text_prompt_segment_other_inputs');
        this.segmentModalOther.innerHTML =
            makeGenericPopover('text_prompt_segment_model', 'Prompt Syntax: Segment Model', 'Model', "What model to find the segment with.\nBy default, CLIP-Seg is a special model that uses text prompt matching.\nYou may instead use a YOLOv8 model.", '')
            + makeDropdownInput(null, 'text_prompt_segment_model', '', 'Segment Model', '', ['CLIP-Seg'], 'CLIP-Seg', false, true, ['CLIP-Seg (Match by prompting)'])
            + makeGenericPopover('text_prompt_segment_textmatch', 'Prompt Syntax: Segment Text Match', 'Text', "The text to match against in the image.\nDoesn't apply when using a YOLO model.\nFor example, 'face' or 'the man's face'", '')
            + makeTextInput(null, 'text_prompt_segment_textmatch', '', 'Text Match', '', '', 'normal', '', false, false, true)
            + makeGenericPopover('text_prompt_segment_yoloid', 'Prompt Syntax: Segment YOLO ID', 'Number', 'The ID of the match within the YOLO result to use.\nDefault of 0 means all matches.\nIf you set to 1, it will use the first match it finds (eg the first face in a group of faces).', '')
            + makeNumberInput(null, 'text_prompt_segment_yoloid', '', 'YOLO ID', '', 0, 0, 100, 1, 'big', false, true)
            + makeGenericPopover('text_prompt_segment_classids', 'Prompt Syntax: Segment Class IDs', 'Text', "If using a YOLO model with multiple classes, optionally specify a comma-separated list of class IDs.\nClass IDs can be numeric (eg 0, 1, 2) or text labels.", '')
            + makeTextInput(null, 'text_prompt_segment_classids', '', 'Class IDs', '', '', 'normal', 'Optional class IDs here...', false, false, true)
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
        this.segmentModalClassIds = getRequiredElementById('text_prompt_segment_classids');
        this.segmentModalYoloId = getRequiredElementById('text_prompt_segment_yoloid');
        this.segmentModalCreativity = getRequiredElementById('text_prompt_segment_creativity');
        this.segmentModalThreshold = getRequiredElementById('text_prompt_segment_threshold');
        this.segmentModalInvertMask = getRequiredElementById('text_prompt_segment_invert_mask');
        this.segmentModalMainText = getRequiredElementById('text_prompt_segment_gentext');
        textPromptAddKeydownHandler(this.segmentModalMainText);
        enableSlidersIn(this.segmentModalOther);
        this.regionModalOther = getRequiredElementById('text_prompt_region_other_inputs');
        this.regionModalOther.innerHTML =
            makeGenericPopover('text_prompt_region_x', 'Prompt Syntax: Region Left X', 'Left X', "The left X coordinate of the region's box.", '')
            + makeSliderInput(null, 'text_prompt_region_x', '', 'Left X', '', 0.25, 0, 1, 0, 1, 0.01, false, false, true)
            + makeGenericPopover('text_prompt_region_y', 'Prompt Syntax: Region Top Y', 'Top Y', "The top Y coordinate of the region's box.", '')
            + makeSliderInput(null, 'text_prompt_region_y', '', 'Top Y', '', 0.25, 0, 1, 0, 1, 0.01, false, false, true)
            + makeGenericPopover('text_prompt_region_width', 'Prompt Syntax: Region Width', 'Width', "The width of the region's box.", '')
            + makeSliderInput(null, 'text_prompt_region_width', '', 'Width', '', 0.5, 0, 1, 0, 1, 0.01, false, false, true)
            + makeGenericPopover('text_prompt_region_height', 'Prompt Syntax: Region Height', 'Height', "The height of the region's box.", '')
            + makeSliderInput(null, 'text_prompt_region_height', '', 'Height', '', 0.5, 0, 1, 0, 1, 0.01, false, false, true)
            + makeGenericPopover('text_prompt_region_strength', 'Prompt Syntax: Region Strength', 'Strength', "How strongly to apply the prompt to the region (vs global prompt).\n0 is no effect, 1 is full effect.", '')
            + makeSliderInput(null, 'text_prompt_region_strength', '', 'Strength', '', 0.5, 0, 1, 0, 1, 0.01, false, false, true)
            + makeGenericPopover('text_prompt_region_inpaint', 'Prompt Syntax: Region Do Inpaint', 'Checkbox', 'Whether to inpaint the region.\nIf checked, the prompt will be used to inpaint the region.', '')
            + makeCheckboxInput(null, 'text_prompt_region_inpaint', '', 'Do Inpaint', '', false, false, false, true)
            + makeGenericPopover('text_prompt_region_inpaintstrength', 'Prompt Syntax: Region Inpaint Strength', 'Strength', "How strongly to inpaint the region (ie InitImageCreativity).\n0 is no inpainting, 1 is full inpainting.\nOnly applies if 'Do Inpaint' is checked above.", '')
            + makeSliderInput(null, 'text_prompt_region_inpaintstrength', '', 'Inpaint Strength', '', 0.5, 0, 1, 0, 1, 0.01, false, false, true)
            + makeGenericPopover('text_prompt_region_gentext', 'Prompt Syntax: Region Generation Prompt', 'text', 'The prompt to use when regenerating the matched area.\nShould be a full text on its own, can use a subset of general prompting syntax.', '')
            + makeTextInput(null, 'text_prompt_region_gentext', '', 'Generation Prompt', '', '', 'prompt', 'Type your generation prompt here...', false, false, true);
        this.regionModalX = getRequiredElementById('text_prompt_region_x');
        this.regionModalY = getRequiredElementById('text_prompt_region_y');
        this.regionModalWidth = getRequiredElementById('text_prompt_region_width');
        this.regionModalHeight = getRequiredElementById('text_prompt_region_height');
        this.regionModalStrength = getRequiredElementById('text_prompt_region_strength');
        this.regionModalInpaint = getRequiredElementById('text_prompt_region_inpaint');
        this.regionModalInpaintStrength = getRequiredElementById('text_prompt_region_inpaintstrength');
        this.regionModalInpaintStrengthSlider = getRequiredElementById('text_prompt_region_inpaintstrength_rangeslider');
        for (let elem of [this.regionModalX, this.regionModalY, this.regionModalWidth, this.regionModalHeight, this.regionModalInpaint]) {
            elem.addEventListener('change', () => this.regionModalProcessChanges());
        }
        this.regionModalMainText = getRequiredElementById('text_prompt_region_gentext');
        this.regionModalCanvasHolder = getRequiredElementById('text_prompt_region_canvasholder');
        this.regionModalCanvas = null;
        this.regionModalCanvasCtx = null;
        this.regionModalMain = getRequiredElementById('text_prompt_region_modal');
        this.regionModalMain.addEventListener('mousemove', (e) => this.regionModalMouseMove(e));
        document.addEventListener('mouseup', (e) => {
            this.regionModalCanvasMouseDown = false;
            this.regionModalCanvasMouseClick = null;
        });
        textPromptAddKeydownHandler(this.regionModalMainText);
        enableSlidersIn(this.regionModalOther);
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
        buttons.push({ key: 'region', key_html: 'Regional Prompt', title: "Supply a different prompt for a sub-region of an image", action: () => {
            this.autoHideMenu();
            this.regionModalClear();
            this.regionModalProcessChanges();
            $('#text_prompt_region_modal').modal('show');
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
        this.segmentModalYoloId.value = 0;
        this.segmentModalClassIds.value = '';
        this.segmentModalInvertMask.checked = false;
        triggerChangeFor(this.segmentModalCreativity);
        triggerChangeFor(this.segmentModalThreshold);
    }

    segmentModalProcessChanges() {
        if (this.segmentModalModelSelect.value == 'CLIP-Seg') {
            findParentOfClass(this.segmentModalTextMatch, 'auto-input').style.display = '';
            findParentOfClass(this.segmentModalYoloId, 'auto-input').style.display = 'none';
            findParentOfClass(this.segmentModalClassIds, 'auto-input').style.display = 'none';
            let text = translate("Text to match against in the image");
            this.segmentModalTextMatch.placeholder = text;
            this.segmentModalTextMatch.title = text;
        }
        else {
            findParentOfClass(this.segmentModalTextMatch, 'auto-input').style.display = 'none';
            findParentOfClass(this.segmentModalYoloId, 'auto-input').style.display = '';
            findParentOfClass(this.segmentModalClassIds, 'auto-input').style.display = '';
        }
    }

    segmentModalSubmit() {
        let modelText = this.segmentModalModelSelect.value;
        if (modelText == "CLIP-Seg") {
            modelText = this.segmentModalTextMatch.value.trim();
        }
        else { // YOLO
            if (parseInt(this.segmentModalYoloId.value) > 0) {
                modelText += `-${this.segmentModalYoloId.value}`;
            }
            let classIds = this.segmentModalClassIds.value.trim();
            if (classIds) {
                modelText += `:${classIds}:`;
            }
        }
        $('#text_prompt_segment_modal').modal('hide');
        this.applyNewSyntax(`<segment:${modelText},${this.segmentModalCreativity.value},${this.segmentModalInvertMask.checked ? '-' : ''}${this.segmentModalThreshold.value}> ${this.segmentModalMainText.value.trim()}`);
    }

    regionModalClear() {
        this.regionModalX.value = 0.25;
        this.regionModalY.value = 0.25;
        this.regionModalWidth.value = 0.5;
        this.regionModalHeight.value = 0.5;
        this.regionModalStrength.value = 0.5;
        this.regionModalInpaint.checked = false;
        this.regionModalInpaintStrength.value = 0.5;
        this.regionModalMainText.value = '';
        this.noOverlap = true;
        triggerChangeFor(this.regionModalX);
        triggerChangeFor(this.regionModalY);
        triggerChangeFor(this.regionModalWidth);
        triggerChangeFor(this.regionModalHeight);
        triggerChangeFor(this.regionModalStrength);
        triggerChangeFor(this.regionModalInpaintStrength);
        this.noOverlap = false;
        let width = document.getElementById('input_width');
        width = width ? width.value : 1024;
        let height = document.getElementById('input_height');
        height = height ? height.value : 1024;
        while (width >= 512 || height >= 512) {
            width /= 2;
            height /= 2;
        }
        this.regionModalCanvasHolder.innerHTML = `<canvas id="text_prompt_region_canvas" width="${width}" height="${height}" style="margin-left:calc(50% - ${width / 2}px)"></canvas>`;
        this.regionModalCanvas = getRequiredElementById('text_prompt_region_canvas');
        this.regionModalCanvasMouseX = 0;
        this.regionModalCanvasMouseY = 0;
        this.regionModalCanvasMouseDown = false;
        this.regionModalCanvasMouseClick = null;
        this.regionModalCanvas.addEventListener('mousedown', (e) => {
            this.regionModalCanvasMouseDown = true;
            this.regionModalCanvasMouseClick = null;
            for (let circle of this.regionModalCircles()) {
                if (circle.contains(e.offsetX, e.offsetY)) {
                    this.regionModalCanvasMouseClick = circle.id;
                    break;
                }
            }
        });
        this.regionModalCanvasCtx = this.regionModalCanvas.getContext('2d');
        this.regionModalRedrawCanvas();
    }

    regionModalMouseMove(e) {
        let canvasRect = this.regionModalCanvas.getBoundingClientRect();
        this.regionModalCanvasMouseX = e.pageX - canvasRect.left;
        this.regionModalCanvasMouseY = e.pageY - canvasRect.top;
        let realX = roundTo(this.regionModalCanvasMouseX / this.regionModalCanvas.width, 0.01);
        let realY = roundTo(this.regionModalCanvasMouseY / this.regionModalCanvas.height, 0.01);
        realX = Math.max(0, Math.min(1, realX));
        realY = Math.max(0, Math.min(1, realY));
        let clickId = this.regionModalCanvasMouseClick;
        if (clickId === null) {
            if (realX > 0 && realX < 1 && realY > 0 && realY < 1) {
                this.regionModalRedrawCanvas();
            }
            return;
        }
        let curX = parseFloat(this.regionModalX.value), curY = parseFloat(this.regionModalY.value), curWidth = parseFloat(this.regionModalWidth.value), curHeight = parseFloat(this.regionModalHeight.value);
        let x1 = curX, y1 = curY, x2 = curX + curWidth, y2 = curY + curHeight;
        if (Math.abs(realX - curX) < 0.01) {
            realX = curX;
        }
        if (Math.abs(realY - curY) < 0.01) {
            realY = curY;
        }
        if (clickId == 0) {
            x1 = realX;
            y1 = realY;
        }
        else if (clickId == 1) {
            x2 = realX;
            y1 = realY;
        }
        else if (clickId == 2) {
            x1 = realX;
            y2 = realY;
        }
        else if (clickId == 3) {
            x2 = realX;
            y2 = realY;
        }
        else if (clickId == 4) {
            x1 = realX - curWidth / 2;
            x2 = realX + curWidth / 2;
            y1 = realY - curHeight / 2;
            y2 = realY + curHeight / 2;
        }
        if (x1 < x2) {
            this.regionModalX.value = roundToAuto(x1, 0.01);
            this.regionModalWidth.value = roundToAuto(x2 - x1, 0.01);
        }
        if (y1 < y2) {
            this.regionModalY.value = roundToAuto(y1, 0.01);
            this.regionModalHeight.value = roundToAuto(y2 - y1, 0.01);
        }
        this.noOverlap = true;
        triggerChangeFor(this.regionModalX);
        triggerChangeFor(this.regionModalY);
        triggerChangeFor(this.regionModalWidth);
        triggerChangeFor(this.regionModalHeight);
        this.noOverlap = false;
        this.regionModalRedrawCanvas();
    }

    regionModalCircles() {
        let x = parseFloat(this.regionModalX.value) * this.regionModalCanvas.width;
        let y = parseFloat(this.regionModalY.value) * this.regionModalCanvas.height;
        let w = parseFloat(this.regionModalWidth.value) * this.regionModalCanvas.width;
        let h = parseFloat(this.regionModalHeight.value) * this.regionModalCanvas.height;
        return [new RegionModalCircle(x, y, 0), new RegionModalCircle(x + w, y, 1), new RegionModalCircle(x, y + h, 2), new RegionModalCircle(x + w, y + h, 3), new RegionModalCircle(x + w / 2, y + h / 2, 4)];
    }

    regionModalRedrawCanvas() {
        let circles = this.regionModalCircles();
        let mouseX = this.regionModalCanvasMouseX;
        let mouseY = this.regionModalCanvasMouseY;
        let ctx = this.regionModalCanvasCtx;
        ctx.fillStyle = 'rgb(128, 128, 128)';
        ctx.clearRect(0, 0, this.regionModalCanvas.width, this.regionModalCanvas.height);
        ctx.strokeStyle = 'rgb(0, 0, 0)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, this.regionModalCanvas.width - 1, this.regionModalCanvas.height - 1);
        ctx.strokeStyle = 'rgb(200, 0, 0)';
        ctx.lineWidth = 1;
        ctx.strokeRect(circles[0].x, circles[0].y, circles[3].x - circles[0].x, circles[3].y - circles[0].y);
        ctx.fillStyle = 'rgb(150, 120, 120)';
        ctx.fillRect(circles[0].x, circles[0].y, circles[3].x - circles[0].x, circles[3].y - circles[0].y);
        for (let circle of circles) {
            ctx.beginPath();
            ctx.arc(circle.x, circle.y, 5, 0, 2 * Math.PI, false);
            ctx.fillStyle = circle.contains(mouseX, mouseY) ? 'rgb(0, 180, 0)' : 'rgb(0, 50, 0)';
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgb(0, 200, 0)';
            ctx.stroke();
        }
    }

    regionModalProcessChanges() {
        if (this.noOverlap) {
            return;
        }
        this.noOverlap = true;
        if (this.regionModalInpaint.checked) {
            findParentOfClass(this.regionModalInpaintStrength, 'auto-input').style.display = '';
        }
        else {
            findParentOfClass(this.regionModalInpaintStrength, 'auto-input').style.display = 'none';
        }
        this.regionModalRedrawCanvas();
        this.noOverlap = false;
    }

    regionModalSubmit() {
        $('#text_prompt_region_modal').modal('hide');
        let key = this.regionModalInpaint.checked ? 'object' : 'region';
        let inpaint = this.regionModalInpaint.checked ? `,${this.regionModalInpaintStrength.value}` : '';
        let x = parseFloat(this.regionModalX.value), y = parseFloat(this.regionModalY.value), w = parseFloat(this.regionModalWidth.value), h = parseFloat(this.regionModalHeight.value);
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        w = Math.max(0, Math.min(1, w + x)) - x;
        h = Math.max(0, Math.min(1, h + y)) - y;
        this.applyNewSyntax(`<${key}:${roundToStrAuto(x, 0.01)},${roundToStrAuto(y, 0.01)},${roundToStrAuto(w, 0.01)},${roundToStrAuto(h, 0.01)},${this.regionModalStrength.value}${inpaint}> ${this.regionModalMainText.value.trim()}`);
    }

    applyNewSyntax(text) {
        this.altTextBox.value = (this.altTextBox.value.trim() + '\n' + text.trim()).trim();
        triggerChangeFor(this.altTextBox);
        this.altTextBox.selectionStart = this.altTextBox.value.length;
        this.altTextBox.selectionEnd = this.altTextBox.value.length;
        this.altTextBox.focus();
    }
}

class RegionModalCircle {
    constructor(x, y, id) {
        this.x = x;
        this.y = y;
        this.id = id;
    }

    contains(mouseX, mouseY) {
        return mouseX >= this.x - 5 && mouseX <= this.x + 5 && mouseY >= this.y - 5 && mouseY <= this.y + 5;
    }
}

let promptPlusButton = new PromptPlusButton();
