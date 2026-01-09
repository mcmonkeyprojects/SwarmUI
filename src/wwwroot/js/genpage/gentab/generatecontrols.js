
function makeWSRequestT2I(url, in_data, callback, errorHandle = null) {
    return makeWSRequest(url, in_data, data => {
        if (data.status) {
            updateCurrentStatusDirect(data.status);
        }
        else if (data.raw_swarm_data) {
            // we don't use this in js
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
    if (num_waiting_gens >= minQueueSize) {
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

let generateForeverTranslatable = translatable('Generate Forever');
let stopGenerateForeverTranslatable = translatable('Stop Generating Forever');
let stopGeneratingPreviewsTranslatable = translatable('Stop Generating Previews');
let generatePreviewsTranslatable = translatable('Generate Previews');

function toggleGenerateForever() {
    let button = getRequiredElementById('generate_forever_button');
    isGeneratingForever = !isGeneratingForever;
    if (isGeneratingForever) {
        button.innerText = stopGenerateForeverTranslatable.get();
        let delaySeconds = parseFloat(getUserSetting('generateforeverdelay', '0.1'));
        let minQueueSize = Math.max(1, parseInt(getUserSetting('generateforeverqueuesize', '1')));
        let delayMs = Math.max(parseInt(delaySeconds * 1000), 1);
        genForeverInterval = setInterval(() => {
            doGenForeverOnce(minQueueSize);
        }, delayMs);
    }
    else {
        button.innerText = generateForeverTranslatable.get();
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
    if (num_waiting_gens < max) {
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
        button.innerText = stopGeneratingPreviewsTranslatable.get();
        genPreviewsInterval = setInterval(() => {
            if (num_waiting_gens == 0) {
                genOnePreview();
            }
        }, 100);
    }
    else {
        button.innerText = generatePreviewsTranslatable.get();
        clearInterval(genPreviewsInterval);
    }
}

/** Clears out and resets the image-batch view, only if the user wants that. */
function resetBatchIfNeeded() {
    if (autoClearBatchElem.checked) {
        clearBatch();
    }
}
