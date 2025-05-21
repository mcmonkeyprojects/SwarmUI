
/** Collection of helper functions and data related to wildcards. */
class WildcardHelpers {

    constructor() {
        this.curWildcardMenuWildcard = null;
        this.allWildcards = [];
        this.wildcardNameCheck = {};
        this.wildcardDataCache = {};
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
        getRequiredElementById('test_wildcard_name').innerText = card.name;
        let choice = Math.floor(Math.random() * card.options.length);
        let val = card.options[choice];
        getRequiredElementById('test_wildcard_result').value = val;
        let button = getRequiredElementById('test_wildcard_again_button');
        if (val.includes('<')) {
            button.disabled = true;
            genericRequest('TestPromptFill', {'prompt': val}, data => {
                button.disabled = false;
                getRequiredElementById('test_wildcard_result').value = data.result;
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
            name: '',
            raw: ''
        };
        this.editWildcard(card);
    }

    /** Edit a wildcard, opening the wildcard edit modal. This can also open the editor for new wildcards. */
    editWildcard(card) {
        if (card == null) {
            return;
        }
        this.curWildcardMenuWildcard = card;
        let imageInput = getRequiredElementById('edit_wildcard_image');
        imageInput.innerHTML = '';
        let enableImage = getRequiredElementById('edit_wildcard_enable_image');
        enableImage.checked = false;
        enableImage.disabled = true;
        let curImg = document.getElementById('current_image_img');
        if (curImg && curImg.tagName == 'IMG') {
            let newImg = curImg.cloneNode(true);
            newImg.id = 'edit_wildcard_image_img';
            newImg.style.maxWidth = '100%';
            newImg.style.maxHeight = '';
            newImg.removeAttribute('width');
            newImg.removeAttribute('height');
            imageInput.appendChild(newImg);
            if (!card.image || card.image == 'imgs/model_placeholder.jpg') {
                enableImage.checked = true;
            }
            enableImage.disabled = false;
        }
        getRequiredElementById('edit_wildcard_name').value = card.name;
        getRequiredElementById('edit_wildcard_contents').value = card.raw;
        $('#edit_wildcard_modal').modal('show');
    }

    /** Saves the edits to a wildcard from the modal created by {@link WildcardHelpers#editWildcard}. */
    saveEditWildcard() {
        let card = this.curWildcardMenuWildcard;
        if (card == null) {
            console.log("Wildcard do save: no wildcard");
            return;
        }
        let data = {
            'card': getRequiredElementById('edit_wildcard_name').value,
            'options': getRequiredElementById('edit_wildcard_contents').value.trim() + '\n',
            'preview_image': '',
            'preview_image_metadata': null
        };
        function complete() {
            if (card.name != data.card && !data['preview_image'] && card.image && card.image != 'imgs/model_placeholder.jpg') {
                data['preview_image'] = card.image;
            }
            genericRequest('EditWildcard', data, resData => {
                wildcardsBrowser.browser.refresh();
                if (card.name && card.name != data.card) {
                    genericRequest('DeleteWildcard', { card: card.name }, data => {});
                }
            });
            $('#edit_wildcard_modal').modal('hide');
        }
        if (getRequiredElementById('edit_wildcard_enable_image').checked) {
            data['preview_image_metadata'] = currentMetadataVal;
            imageToData(getRequiredElementById('edit_wildcard_image').getElementsByTagName('img')[0].src, (dataURL) => {
                data['preview_image'] = dataURL;
                complete();
            }, true);
        }
        else {
            complete();
        }
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
