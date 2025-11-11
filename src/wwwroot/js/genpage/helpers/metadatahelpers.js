
function upvertAutoWebuiMetadataToSwarm(metadata) {
    let realData = {};
    // Auto webui has no "proper formal" syntax like JSON or anything,
    // just a mishmash of text, and there's no way to necessarily predict newlines/colons/etc,
    // so just make best effort to import based on some easy examples
    if (metadata.includes("\nNegative prompt: ")) {
        let parts = splitWithTail(metadata, "\nNegative prompt: ", 2);
        realData['prompt'] = parts[0];
        let subSplit = parts[1].split("\n", 2);
        realData['negativeprompt'] = subSplit[0];
        metadata = subSplit[1];
    }
    else {
        let lines = metadata.split('\n');
        realData['prompt'] = lines.slice(0, lines.length - 1).join('\n');
        metadata = lines[lines.length - 1];
    }
    let lines = metadata.split('\n');
    if (lines.length > 0) {
        let dataParts = lines[lines.length - 1].split(',').map(x => x.split(':').map(y => y.trim()));
        for (let part of dataParts) {
            if (part.length == 2) {
                let clean = cleanParamName(part[0]);
                if (rawGenParamTypesFromServer.find(x => x.id == clean)) {
                    realData[clean] = part[1];
                }
                else if (clean == "size") {
                    let sizeParts = part[1].split('x').map(x => parseInt(x));
                    if (sizeParts.length == 2) {
                        realData['width'] = sizeParts[0];
                        realData['height'] = sizeParts[1];
                    }
                }
                else if (clean == "scheduletype") {
                    realData["scheduler"] = part[1].toLowerCase();
                }
                else {
                    realData[part[0]] = part[1];
                }
            }
        }
    }
    return JSON.stringify({ 'sui_image_params': realData });
}

let fooocusMetadataMap = [
    ['Prompt', 'prompt'],
    ['Negative', 'negativeprompt'],
    ['cfg', 'cfgscale'],
    ['sampler_name', 'sampler'],
    ['base_model_name', 'model'],
    ['denoise', 'imageinitcreativity']
];

function remapMetadataKeys(metadata, keymap) {
    for (let pair of keymap) {
        if (pair[0] in metadata) {
            metadata[pair[1]] = metadata[pair[0]];
            delete metadata[pair[0]];
        }
    }
    for (let key in metadata) {
        if (metadata[key] == null) { // Why does Fooocus emit nulls?
            delete metadata[key];
        }
    }
    return metadata;
}

const imageMetadataKeys = ['parameters', 'Parameters', 'userComment', 'UserComment', 'model', 'Model', 'prompt', 'Prompt'];

function interpretMetadata(metadata) {
    if (Array.isArray(metadata)) {
        metadata = new Uint8Array(metadata);
    }
    if (metadata instanceof Uint8Array) {
        let prefix = metadata.slice(0, 8);
        let data = metadata.slice(8);
        let encodeType = new TextDecoder().decode(prefix);
        if (encodeType.startsWith('UNICODE')) {
            if (data[0] == 0 && data[1] != 0) { // This is slightly dirty detection, but it works at least for English text.
                metadata = decodeUtf16LE(data);
            }
            else {
                metadata = decodeUtf16(data);
            }
        }
        else {
            metadata = new TextDecoder().decode(data);
        }
    }
    if (metadata) {
        metadata = metadata.trim();
        if (metadata.startsWith('{')) {
            let json = JSON.parse(metadata);
            if ('sui_image_params' in json) {
                // It's swarm, we're good
            }
            else if ("Prompt" in json) {
                // Fooocus
                json = remapMetadataKeys(json, fooocusMetadataMap);
                metadata = JSON.stringify({ 'sui_image_params': json });
            }
            else {
                // Don't know - discard for now.
                metadata = null;
            }
        }
        else {
            let lines = metadata.split('\n');
            if (lines.length > 1) {
                try {
                    metadata = upvertAutoWebuiMetadataToSwarm(metadata);
                }
                catch (e) {
                    console.error(`Error parsing metadata '${metadata}': ${e}`);
                    metadata = null;
                }
            }
            else {
                // ???
                metadata = null;
            }
        }
    }
    return metadata;
}

function parseMetadata(data, callback) {
    if (data instanceof Image) {
        data = data.src;
    }
    fetch(data).then(r => r.blob()).then(b => b.arrayBuffer()).then(buffer => ExifReader.load(buffer, {async: true})).then(parsed => {
        let metadata = null;
        if (parsed) {
            for (let key of imageMetadataKeys) {
                if (key in parsed) {
                    metadata = parsed[key].value;
                    break;
                }
            }
        }
        metadata = interpretMetadata(metadata);
        callback(data, metadata);
    }).catch(err => {
        callback(data, null);
    });
}

let metadataKeyFormatCleaners = [];
let promptCidMatcher = new RegExp('\<(.*?)//cid=\\d+>', 'g');

function formatMetadata(metadata) {
    if (!metadata) {
        return '';
    }
    let data;
    try {
        let readable = interpretMetadata(metadata);
        if (!readable) {
            return '';
        }
        data = JSON.parse(readable);
    }
    catch (e) {
        console.log(`Error parsing metadata '${metadata}': ${e}`);
        return `Broken metadata: ${escapeHtml(metadata)}`;
    }
    let result = '';
    function appendObject(obj) {
        if (obj) {
            for (let key of Object.keys(obj)) {
                let val = obj[key];
                if (val !== null && val !== '') { // According to javascript, 0 == '', so have to === to block that. Argh.
                    for (let cleaner of metadataKeyFormatCleaners) {
                        key = cleaner(key);
                    }
                    let hash = Math.abs(hashCode(key.toLowerCase().replaceAll(' ', '').replaceAll('_', ''))) % 10;
                    let title = '';
                    let keyTitle = '';
                    let added = '';
                    let extras = '';
                    if (key.includes('model') || key.includes('lora') || key.includes('embedding')) {
                        added += ' param_view_block_model';
                    }
                    if (key.includes('prompt')) {
                        extras = `<button title="Click to copy" class="basic-button prompt-copy-button" onclick="copyText('${escapeHtmlNoBr(escapeJsString(`${val}`))}');doNoticePopover('Copied!', 'notice-pop-green');">&#x29C9;</button>`;
                    }
                    let param = getParamById(key);
                    if (param) {
                        key = param.name;
                        keyTitle = param.description;
                        if (param.values && param.value_names && param.values.length == param.value_names.length) {
                            let index = param.values.indexOf(val);
                            if (index != -1) {
                                title = val;
                                val = param.value_names[index];
                            }
                        }
                    }
                    result += `<span class="param_view_block tag-text tag-type-${hash}${added}"><span class="param_view_name" title="${escapeHtmlNoBr(keyTitle)}">${escapeHtml(key)}</span>: `;
                    if (typeof val == 'object') {
                        appendObject(val);
                    }
                    else {
                        result += `<span class="param_view tag-text-soft tag-type-${hash}" title="${escapeHtmlNoBr(title)}">${escapeHtml(`${val}`)}</span>`;
                    }
                    result += `${extras}</span>, `;
                }
            }
        }
    };
    if ('swarm_version' in data.sui_image_params && 'sui_extra_data' in data) {
        data.sui_extra_data['Swarm Version'] = data.sui_image_params.swarm_version;
        delete data.sui_image_params.swarm_version;
    }
    if ('prompt' in data.sui_image_params && data.sui_image_params.prompt) {
        let prompt = data.sui_image_params.prompt;
        if ('sui_extra_data' in data && 'original_prompt' in data.sui_extra_data) {
            let originalPrompt = data.sui_extra_data.original_prompt;
            if (prompt.replaceAll(promptCidMatcher, '<$1>') == originalPrompt) {
                prompt = originalPrompt;
                delete data.sui_extra_data.original_prompt;
            }
        }
        appendObject({ 'prompt': prompt });
        result += '\n<br>';
        delete data.sui_image_params.prompt;
    }
    if ('negativeprompt' in data.sui_image_params && data.sui_image_params.negativeprompt) {
        appendObject({ 'negativeprompt': data.sui_image_params.negativeprompt });
        result += '\n<br>';
        delete data.sui_image_params.negativeprompt;
    }
    if ('loras' in data.sui_image_params && 'loraweights' in data.sui_image_params) {
        let loras = data.sui_image_params.loras;
        let loraWeights = data.sui_image_params.loraweights;
        let loraSectionConfinement = data.sui_image_params['lorasectionconfinement'];
        let simpleLoras = [];
        // TODO: Maybe look up some metadata on the models here?
        for (let i = 0; i < loras.length; i++) {
            let lora = loras[i];
            let weight = `${loraWeights[i]}`;
            if (loraSectionConfinement && loraSectionConfinement[i] != 0) {
                let name = loraHelper.confinementNames[loraSectionConfinement[i]] || loraSectionConfinement[i];
                weight = `${weight} (${name})`;
            }
            simpleLoras.push(`${lora} : ${weight}`);
        }
        delete data.sui_image_params.loras;
        delete data.sui_image_params.loraweights;
        delete data.sui_image_params['lorasectionconfinement'];
        data.sui_image_params['loras'] = simpleLoras;
    }
    appendObject(data.sui_image_params);
    result += '\n<br>';
    if ('sui_extra_data' in data) {
        appendObject(data.sui_extra_data);
    }
    return result;
}
