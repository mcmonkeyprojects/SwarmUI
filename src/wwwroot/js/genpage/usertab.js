class APIKeyHelper {
    constructor(keyType, prefix) {
        this.keyType = keyType;
        this.prefix = prefix;
        this.getElems();
    }

    getElems() { // Some form of cursed HTML reset seems to happen? So re-grab elements
        this.keyInput = getRequiredElementById(`${this.prefix}_api_key`);
        this.keySubmit = getRequiredElementById(`${this.prefix}_key_submit`);
        this.keyRemove = getRequiredElementById(`${this.prefix}_key_remove`);
        this.keyStatus = getRequiredElementById(`${this.prefix}_key_status`);
    }

    onKeyInput() {
        this.getElems();
        let key = this.keyInput.value;
        this.keySubmit.disabled = !key;
    }

    onSaveButton() {
        let key = this.keyInput.value;
        if (!key) {
            alert('Please enter a key');
            return;
        }
        this.keySubmit.disabled = true;
        genericRequest('SetAPIKey', { keyType: this.keyType, key: key }, data => {
            this.updateStatus();
        });
    }

    onRemoveButton() {
        genericRequest('SetAPIKey', { keyType: this.keyType, key: 'none' }, data => {
            this.updateStatus();
        });
    }

    updateStatus() {
        genericRequest('GetAPIKeyStatus', { keyType: this.keyType }, data => {
            this.keyStatus.innerText = data.status;
            this.keyRemove.disabled = data.status == 'not set';
        });
    }
}

stabilityAPIHelper = new APIKeyHelper('stability_api', 'stability');
civitaiAPIHelper = new APIKeyHelper('civitai_api', 'civitai');

getRequiredElementById('usersettingstabbutton').addEventListener('click', () => {
    stabilityAPIHelper.updateStatus();
    civitaiAPIHelper.updateStatus();
});
