language = getCookie("display_language");
translate_keys = {};
language_data = {};
known_translatables = {};

class Translatable {
    constructor(key) {
        this.key = key;
        known_translatables[key] = this;
    }

    get() {
        return translate(this.key);
    }
}

let neverTranslateCodes = [
    '192.168.', // addresses (eg backends list)
    '--listen', // args (eg backends list)
    'GeForce RTX', // hardware (eg server info resources)
    'Stable Diffusion XL 1.0 Base', // Models list data
    'sdxlofficial/', // presets list
    'raw/2024-', 'raw/2025-' // history list
]

/** Safety check for known text keys that definitely shouldn't be translated */
function validateTranslationSafety(text, context) {
    if (text == null || text == "") {
        return true;
    }
    if (neverTranslateCodes.some(code => text.includes(code))) {
        console.log(`ERROR BAD TRANSLATION CALL ${text} translated in context '${context}' at stack ${new Error().stack}`);
        return true;
    }
    return false;
}

function translate(text) {
    if (validateTranslationSafety(text, "translate")) {
        return text;
    }
    let result = translate_keys[text];
    if (!result) {
        translate_keys[text] = "";
        return text;
    }
    return result;
}

function translatable(key) {
    let val = translate_keys[key];
    if (val) {
        return val;
    }
    return new Translatable(key);
}

function debugSubmitTranslatables() {
    let keys = Object.keys(translate_keys).concat(Object.keys(known_translatables));
    genericRequest('DebugLanguageAdd', { set: keys }, data => { });
}

function applyTranslations(root = null) {
    if (!language_data || !language_data.local_name) {
        return;
    }
    let dropdown = document.getElementById('language_dropdown_link');
    if (dropdown) {
        let newHtml = `<img class="translate-img" src="imgs/flags/${language_data.code}.jpg" /> ${escapeHtml(language_data.local_name)}`;
        if (dropdown.innerHTML != newHtml) { // try to avoid reload flicker
            dropdown.innerHTML = newHtml;
        }
    }
    if (root == null) {
        root = document;
    }
    function doTranslateNow(elem) {
        if (elem.title) {
            if (validateTranslationSafety(elem.dataset.pretranslated_title || elem.title, `element title ${elem.id}`)) {
                return;
            }
            let translated = translate(elem.dataset.pretranslated_title || elem.title);
            if (translated == elem.title) {
                return;
            }
            if (!elem.dataset.pretranslated_title) {
                elem.dataset.pretranslated_title = elem.title;
            }
            elem.title = translated;
        }
        if (elem.placeholder) {
            if (validateTranslationSafety(elem.dataset.pretranslated_placeholder || elem.placeholder, `element placeholder ${elem.id}`)) {
                return;
            }
            let translated = translate(elem.dataset.pretranslated_placeholder || elem.placeholder);
            if (translated == elem.placeholder) {
                return;
            }
            if (!elem.dataset.pretranslated_placeholder) {
                elem.dataset.pretranslated_placeholder = elem.placeholder;
            }
            elem.placeholder = translated;
            return; // placeholdered elements are text inputs, ie don't replace content
        }
        if (elem.textContent && !elem.classList.contains("translate-no-text")) {
            if (validateTranslationSafety(elem.dataset.pretranslated || elem.innerHTML, `element textContent ${elem.id}`)) {
                return;
            }
            let rawText = elem.innerHTML;
            let firstBracket = rawText.indexOf('<');
            let edited = false;
            if (firstBracket != -1) {
                edited = true;
                if (firstBracket > 0 && rawText.substring(0, firstBracket).trim() != "") {
                    rawText = `<span class="translate">${rawText.substring(0, firstBracket)}</span>${rawText.substring(firstBracket)}`;
                }
            }
            let lastEndBracket = rawText.lastIndexOf('>');
            if (lastEndBracket != -1) {
                edited = true;
                if (lastEndBracket < rawText.length - 1 && rawText.substring(lastEndBracket + 1).trim() != "") {
                    rawText = `${rawText.substring(0, lastEndBracket + 1)}<span class="translate">${rawText.substring(lastEndBracket + 1)}</span>`;
                }
            }
            if (edited) {
                elem.innerHTML = rawText;
                elem.classList.add("translate-no-text");
                for (let subElem of elem.querySelectorAll(".translate")) {
                    doTranslateNow(subElem);
                }
                return;
            }
            let translated = translate(elem.dataset.pretranslated || elem.textContent);
            if (translated == elem.textContent) {
                return;
            }
            if (!elem.dataset.pretranslated) {
                elem.dataset.pretranslated = elem.textContent;
            }
            elem.dataset.textContentWasTranslated = true;
            elem.textContent = translated;
        }
    }
    for (let elem of root.querySelectorAll(".translate")) {
        doTranslateNow(elem);
    }
}

function loadAndApplyTranslations() {
    genericRequest('GetLanguage', { language: language }, data => {
        language_data = data.language;
        translate_keys = data.language.keys;
        applyTranslations();
    });
}

function changeLanguage(code) {
    language = code;
    setCookie("display_language", code, 365);
    let langSetting = document.getElementById('usersettings_language');
    if (langSetting) {
        langSetting.value = code;
        triggerChangeFor(langSetting);
        save_user_settings();
    }
    let installerSetting = document.getElementById('installer_language');
    if (installerSetting) {
        installerSetting.value = code;
        triggerChangeFor(installerSetting);
    }
    loadAndApplyTranslations();
}

function translateableHtml(key) {
    if (key.replaceAll('<br>', '').includes('<')) {
        return key;
    }
    return `<span class="translate" data-pretranslated="${key.replaceAll('<br>', '')}">${translate(key)}</span>`;
}
