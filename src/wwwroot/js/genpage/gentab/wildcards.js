
/** Collection of helper functions and data related to wildcards. */
class WildcardHelpers {

    constructor() {
        this.curWildcardMenuWildcard = null;
        this.allWildcards = [];
        this.wildcardNameCheck = {};
        this.wildcardDataCache = {};
        this.nameElem = getRequiredElementById('edit_wildcard_name');
        this.experimentalEditorElem = getRequiredElementById('edit_wildcard_experimental_editor');
        this.experimentalEditorSpotElem = getRequiredElementById('edit_wildcard_editor_spot');
        this.toggleExperimentalEditor();
        this.imageBlockElem = getRequiredElementById('edit_wildcard_image_block');
        let imageHtml = makeImageInput(null, 'edit_wildcard_image', null, 'Image', 'Image', true, false);
        this.imageBlockElem.innerHTML = imageHtml;
        this.errorBoxElem = getRequiredElementById('edit_wildcard_modal_error');
        this.testResultElem = getRequiredElementById('test_wildcard_result');
        this.testAgainButtonElem = getRequiredElementById('test_wildcard_again_button');
        this.testNameElem = getRequiredElementById('test_wildcard_name');
        this.modalElem = getRequiredElementById('edit_wildcard_modal');
        this.modalMayClose = true;
        this.nameElem.addEventListener('input', () => {
            this.modalMayClose = false;
        });
        $(() => {
            $(this.modalElem).modal({backdrop: 'static', keyboard: false});
        });
        $(this.modalElem).on('hidePrevented.bs.modal', () => {
            if (this.modalMayClose) {
                $(this.modalElem).modal('hide');
            }
            else {
                this.wildcardModalError('You have unsaved changes. Please Save or Cancel');
            }
        });
        this.imageElem = getRequiredElementById('edit_wildcard_image');
        this.enableImageElem = getRequiredElementById('edit_wildcard_image_toggle');
    }

    /** Toggles the experimental editor. */
    toggleExperimentalEditor() {
        let content = null;
        if (this.contentsElem) {
            content = getTextContent(this.contentsElem);
        }
        if (this.experimentalEditorElem.checked) {
            this.experimentalEditorSpotElem.innerHTML = '<div class="editable-textbox" id="edit_wildcard_contents" style="min-height: 15lh" contenteditable="true"></div>';
            this.contentsElem = getRequiredElementById('edit_wildcard_contents');
            this.contentsElem.addEventListener('input', () => {
                this.processContents();
            });
        }
        else {
            this.experimentalEditorSpotElem.innerHTML = '<textarea class="auto-text auto-text-block" id="edit_wildcard_contents" rows="15" placeholder="Wildcard options (1 per line)"></textarea>';
            this.contentsElem = getRequiredElementById('edit_wildcard_contents');
        }
        if (content) {
            setTextContent(this.contentsElem, content);
        }
        this.contentsElem.addEventListener('input', () => {
            this.modalMayClose = false;
        });
        this.processContents();
    }

    /** Applies a new wildcard list from the server. */
    newWildcardList(cards) {
        this.allWildcards = cards;
        this.wildcardDataCache = {};
        this.wildcardNameCheck = {};
        for (let card of cards) {
            this.wildcardNameCheck[card.toLowerCase()] = card.name;
        }
    }

    /** Test a wildcard, opening the wildcard test modal. */
    testWildcard(card) {
        if (card == null) {
            return;
        }
        this.curWildcardMenuWildcard = card;
        this.testNameElem.innerText = card.name;
        let choice = Math.floor(Math.random() * card.options.length);
        let val = card.options[choice];
        this.testResultElem.value = val;
        let button = this.testAgainButtonElem;
        if (val.includes('<')) {
            button.disabled = true;
            genericRequest('TestPromptFill', {'prompt': val}, data => {
                button.disabled = false;
                this.testResultElem.value = data.result;
                $('#test_wildcard_modal').modal('show');
            });
        }
        else {
            button.disabled = false;
            $('#test_wildcard_modal').modal('show');
        }
    }

    /** Test a wildcard again, using the same wildcard as before, in the same modal.
     * See {@link WildcardHelpers#testWildcard} for more details.
    */
    testWildcardAgain() {
        let card = this.curWildcardMenuWildcard;
        if (card == null) {
            console.log("Wildcard do test: no wildcard");
            return;
        }
        this.testWildcard(card);
    }

    /** Create a new wildcard, opening the wildcard edit modal with blank inputs.
     * See {@link WildcardHelpers#editWildcard} for more details.
     */
    createNewWildcardButton() {
        let card = {
            name: wildcardsBrowser.browser.folder,
            raw: ''
        };
        this.editWildcard(card);
    }

    /** Processes the contents of the wildcard contents edit box, reapplying syntax highlighting. */
    processContents() {
        if (this.contentsElem.tagName == 'TEXTAREA') {
            return;
        }
        let [start, end] = getTextSelRange(this.contentsElem);
        let contents = getTextContent(this.contentsElem);
        let lines = contents.split('\n');
        let html = '';
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimLine = line.trim();
            let clazz = `wc_line_${i % 2}`;
            if (trimLine.startsWith('#')) {
                clazz += ' wc_line_comment';
            }
            html += `<span class="${clazz}">${line}</span>`;
            if (i < lines.length - 1) {
                html += '<br>';
            }
        }
        this.contentsElem.innerHTML = html;
        setTextSelRange(this.contentsElem, start, end);
    }

    /** Edit a wildcard, opening the wildcard edit modal. This can also open the editor for new wildcards. */
    editWildcard(card) {
        if (card == null) {
            return;
        }
        this.curWildcardMenuWildcard = card;
        clearMediaFileInput(this.imageElem);
        this.enableImageElem.checked = false;
        let curImg = currentImageHelper.getCurrentImage();
        this.nameElem.value = card.name;
        setTextContent(this.contentsElem, card.raw);
        this.processContents();
        this.errorBoxElem.innerText = '';
        this.modalMayClose = true;
        let run = () => {
            triggerChangeFor(this.enableImageElem);
            $(this.modalElem).modal('show');
        };
        if (curImg && curImg.tagName == 'IMG') {
            setMediaFileDirect(this.imageElem, curImg.src, 'image', 'cur', 'cur', () => {
                this.enableImageElem.checked = false;
                run();
            });
        }
        else {
            run();
        }
    }

    wildcardModalError(error) {
        console.log(`Wildcard modal error: ${error}`);
        this.errorBoxElem.innerText = error;
    }

    /** Saves the edits to a wildcard from the modal created by {@link WildcardHelpers#editWildcard}. */
    saveEditWildcard() {
        this.errorBoxElem.innerText = '';
        let card = this.curWildcardMenuWildcard;
        if (card == null) {
            this.wildcardModalError('No wildcard available to save (internal error?)');
            return;
        }
        let name = this.nameElem.value.trim().replaceAll('\\', '/').replace(/^\/+/, '');
        if (name == '') {
            this.wildcardModalError('Name is required');
            return;
        }
        if (name.endsWith('/')) {
            this.wildcardModalError('Cannot save a wildcard as a folder, give it a filename, or remove the trailing slash');
            return;
        }
        let content = getTextContent(this.contentsElem).trim();
        if (content == '') {
            this.wildcardModalError('At least one entry is required');
            return;
        }
        let data = {
            'card': name,
            'options': content + '\n',
            'preview_image': '',
            'preview_image_metadata': null
        };
        let complete = () => {
            if (card.name != data.card && !data['preview_image'] && card.image && card.image != 'imgs/model_placeholder.jpg') {
                data['preview_image'] = card.image;
            }
            genericRequest('EditWildcard', data, resData => {
                wildcardsBrowser.browser.refresh();
                if (card.name && card.name != data.card && !card.name.endsWith('/')) {
                    genericRequest('DeleteWildcard', { card: card.name }, data => {});
                }
            });
            $(this.modalElem).modal('hide');
        }
        if (this.enableImageElem.checked) {
            let imageVal = getInputVal(this.imageElem);
            if (imageVal) {
                data['preview_image_metadata'] = currentMetadataVal;
                imageToData(imageVal, (dataURL) => {
                    data['preview_image'] = dataURL;
                    complete();
                }, true);
                return;
            }
            else {
                data['preview_image'] = 'clear';
                delete data['preview_image_metadata'];
            }
        }
        complete();
    }

    /** Duplicate a wildcard, creating a new wildcard with a unique name. Does not open any modal, just has the server duplicate immediately. */
    duplicateWildcard(card) {
        if (card == null) {
            return;
        }
        let name = card.name;
        let i = 2;
        while (`${name.toLowerCase()} - ${i}` in this.wildcardNameCheck) {
            i++;
        }
        let data = {
            'card': `${name} - ${i}`,
            'options': card.raw,
            'preview_image': card.image && card.image != 'imgs/model_placeholder.jpg' ? card.image : '',
            'preview_image_metadata': null
        }
        genericRequest('EditWildcard', data, resData => {
            wildcardsBrowser.browser.refresh();
        });
    }

    /** Small util to match a wildcard syntax entry in a prompt. */
    matchWildcard(prompt, wildcard) {
        let matcher = new RegExp(`<(wildcard(?:\\[\\d+(?:-\\d+)?\\])?):${regexEscape(wildcard)}>`, 'g');
        return prompt.match(matcher);
    }

    /** Select a wildcard, adding it to the prompt (or removing it if it's the last present text). */
    selectWildcard(model) {
        let [promptBox, cursorPos] = uiImprover.getLastSelectedTextbox();
        if (!promptBox) {
            promptBox = getRequiredElementById('alt_prompt_textbox');
            cursorPos = promptBox.value.length;
        }
        let prefix = promptBox.value.substring(0, cursorPos);
        let suffix = promptBox.value.substring(cursorPos);
        let trimmed = prefix.trim();
        let match = this.matchWildcard(trimmed, model.name);
        if (match && match.length > 0) {
            let last = match[match.length - 1];
            if (trimmed.endsWith(last.trim())) {
                promptBox.value = (trimmed.substring(0, trimmed.length - last.length).trim() + ' ' + suffix).trim();
                triggerChangeFor(promptBox);
                return;
            }
        }
        let wildcardText = `<wildcard:${model.name}>`;
        promptBox.value = `${prefix.trim()} ${wildcardText} ${suffix.trim()}`.trim();
        promptBox.selectionStart = cursorPos + wildcardText.length + 1;
        promptBox.selectionEnd = cursorPos + wildcardText.length + 1;
        promptBox.focus();
        triggerChangeFor(promptBox);
    }

    /** Async function (returns a simple object with 'isComplete' and 'data') to get the data for a wildcard, using the wildcard name. Caches results and doesn't request the same data more than once. */
    getWildcardDataFor(name) {
        name = name.trim().toLowerCase();
        if (name in this.wildcardDataCache) {
            return { isComplete: true, data: this.wildcardDataCache[name] };
        }
        if (!(name in this.wildcardNameCheck)) {
            return { isComplete: true, data: null };
        }
        if (this.wildcardDataCache[name + "____READ_NOW"]) {
            return this.wildcardDataCache[name + "____READ_NOW"];
        }
        let result = { isComplete: false, data: null };
        this.wildcardDataCache[name + "____READ_NOW"] = result;
        let giveResult = (data) => {
            this.wildcardDataCache[name] = data;
            result.data = data;
            result.isComplete = true;
            delete this.wildcardDataCache[name + "____READ_NOW"];
        }
        genericRequest('DescribeModel', { subtype: 'Wildcards', modelName: name }, data => {
            giveResult(data.options);
        }, 0, e => giveResult(null));
        return result;
    }
}

/** Collection of helper functions and data related to wildcards, just an instance of {@link WildcardHelpers}. */
let wildcardHelpers = new WildcardHelpers();
