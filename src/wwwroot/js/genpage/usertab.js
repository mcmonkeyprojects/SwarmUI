apiHelpers = {};

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
            this.keyInput.value = '';
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
            this.onKeyInput();
        });
    }
}

for (let keyRow of getRequiredElementById('api_keys_table').querySelectorAll('tr')) {
    let keyType = keyRow.dataset.key;
    let prefix = keyRow.dataset.prefix;
    if (keyType && prefix) {
        apiHelpers[keyType] = new APIKeyHelper(keyType, prefix);
    }
}

getRequiredElementById('usersettingstabbutton').addEventListener('click', () => {
    for (let key in apiHelpers) {
        apiHelpers[key].updateStatus();
    }
});

/** Central handler for user-edited parameters. */
class ParamConfigurationClass {

    constructor() {
        this.edited_groups = {};
        this.edited_params = {};
        this.extra_count = 0;
        this.param_edits = { groups: {}, params: {} };
        this.saved_edits = {};
        this.container = getRequiredElementById('user_param_config_container');
        this.confirmer = getRequiredElementById('user_param_config_confirmer');
    }

    /** First init, mostly just to store the server's original param info. */
    preInit() {
        this.original_param_types = JSON.parse(JSON.stringify(rawGenParamTypesFromServer));
        let arr = filterDistinctBy(this.original_param_types.filter(p => p.group).map(p => p.group), g => g.id);
        this.original_groups = {};
        for (let group of arr) {
            this.original_groups[group.id] = group;
        }
    }

    /** Loads the user-editable parameter configuration tab, filling out the inputs and values. Called only once during init. */
    loadUserParamConfigTab() {
        this.container.innerHTML = ``;
        let lastGroup = '__none__';
        let groupDiv = null;
        for (let param of rawGenParamTypesFromServer) {
            let group = param.original_group || param.group;
            let groupId = group ? group.id : null;
            if (groupId != lastGroup) {
                lastGroup = groupId;
                groupDiv = createDiv(null, 'param-edit-group-container');
                if (groupId) {
                    let groupPrefix = `user_param_config_group_${group.id}`;
                    let groupHtml = `
                        <div class="param-edit-header">Group: ${group.name}</div>
                        <div class="param-edit-part"><button id="${groupPrefix}_reset" class="basic-button">Reset</button></div>
                        <div class="param-edit-part">Open by default: <input type="checkbox" id="${groupPrefix}__open"${group.open ? ` checked="true"` : ''} autocomplete="off"></div>
                        <div class="param-edit-part">IsAdvanced: <input type="checkbox" id="${groupPrefix}__advanced"${group.advanced ? ` checked="true"` : ''} autocomplete="off"></div>
                        <div class="param-edit-part">Ordering Priority: <input type="number" class="param-edit-number" id="${groupPrefix}__priority" value="${group.priority}" autocomplete="off"></div>`;
                    groupDiv.appendChild(createDiv(null, 'param-edit-container-for-group', groupHtml));
                    this.container.appendChild(groupDiv);
                    getRequiredElementById(`${groupPrefix}_reset`).addEventListener('click', () => {
                        for (let opt of ['open', 'advanced', 'priority']) {
                            let elem = getRequiredElementById(`${groupPrefix}__${opt}`);
                            delete elem.dataset.orig_val;
                            setInputVal(elem, this.original_groups[groupId][opt]);
                            triggerChangeFor(elem);
                        }
                        delete this.edited_groups[groupId];
                        delete this.param_edits.groups[groupId];
                        this.extra_count++;
                        this.updateConfirmer();
                    });
                    for (let opt of ['open', 'advanced', 'priority']) {
                        let elem = getRequiredElementById(`${groupPrefix}__${opt}`);
                        elem.dataset.orig_val = getInputVal(elem);
                        elem.addEventListener('input', () => {
                            if (!this.edited_groups[group.id]) {
                                this.edited_groups[group.id] = { changed: {} };
                            }
                            let val = getInputVal(elem);
                            if (`${val}` == elem.dataset.orig_val) {
                                delete this.edited_groups[group.id].changed[opt];
                                if (Object.keys(this.edited_groups[group.id].changed).length == 0) {
                                    delete this.edited_groups[group.id];
                                }
                            }
                            else {
                                this.edited_groups[group.id].changed[opt] = val;
                            }
                            this.updateConfirmer();
                        });
                    }
                }
                else {
                    this.container.appendChild(groupDiv);
                }
            }
            let paramPrefix = `user_param_config_param_${param.id}`;
            let paramHtml = `
                <div class="param-edit-header">Param: ${param.name} (${param.type})</div>
                <div class="param-edit-part"><button id="${paramPrefix}_reset" class="basic-button">Reset</button></div>
                <div class="param-edit-part">Visible Normally: <input type="checkbox" id="${paramPrefix}__visible"${param.visible ? ` checked="true"` : ''} autocomplete="off"></div>
                    <div class="param-edit-part">Do Not Save: <input type="checkbox" id="${paramPrefix}__do_not_save"${param.do_not_save ? ` checked="true"` : ''} autocomplete="off"></div>
                    <div class="param-edit-part">IsAdvanced: <input type="checkbox" id="${paramPrefix}__advanced"${param.advanced ? ` checked="true"` : ''} autocomplete="off"></div>
                    <div class="param-edit-part">Ordering Priority: <input type="number" class="param-edit-number" id="${paramPrefix}__priority" value="${param.priority}" autocomplete="off"></div>`;
            if (param.type == "integer" || param.type == "decimal" || (param.type == "list" && param.max)) {
                paramHtml += `
                    <div class="param-edit-part">Min: <input class="param-edit-number" type="number" id="${paramPrefix}__min" value="${param.min}" autocomplete="off"></div>
                    <div class="param-edit-part">Max: <input class="param-edit-number" type="number" id="${paramPrefix}__max" value="${param.max}" autocomplete="off"></div>
                    <div class="param-edit-part"><span title="If using a slider, this is where the slider stops">View Max</span>: <input type="number" id="${paramPrefix}__view_max" value="${param.view_max}" autocomplete="off"></div>
                    <div class="param-edit-part">Step: <input class="param-edit-number" type="number" id="${paramPrefix}__step" value="${param.step}" autocomplete="off"></div>
                    <div class="param-edit-part">View Type: <select id="${paramPrefix}__view_type" autocomplete="off">`;
                for (let type of ['small', 'big', 'seed', 'slider', 'pot_slider']) {
                    paramHtml += `<option value="${type}"${param.view_type == type ? ` selected="true"` : ''}>${type}</option>`;
                }
                paramHtml += `</select></div>`;
            }
            else if (param.type == "text") {
                paramHtml += `<div class="param-edit-part">View Type: <select id="${paramPrefix}__view_type" autocomplete="off">`;
                for (let type of ['normal', 'prompt']) {
                    paramHtml += `<option value="${type}"${param.view_type == type ? ` selected="true"` : ''}>${type}</option>`;
                }
                paramHtml += `</select></div>`;
            }
            if (!param.values && param.type != "boolean") {
                paramHtml += `<div class="param-edit-part">Examples: <input class="param-edit-text" type="text" id="${paramPrefix}__examples" value="${param.examples ? param.examples.join(' || ') : ''}" autocomplete="off"></div>`;
            }
            paramHtml += `<div class="param-edit-part">Group: <select id="${paramPrefix}__group" autocomplete="off">`;
            for (let groupOpt of Object.values(rawGroupMapFromServer)) {
                paramHtml += `<option value="${groupOpt.id}"${groupId == groupOpt.id ? ` selected="true"` : ''}>${groupOpt.name}</option>`;
            }
            paramHtml += `</select></div>`;
            groupDiv.appendChild(createDiv(null, 'param-edit-container', paramHtml));
            getRequiredElementById(`${paramPrefix}_reset`).addEventListener('click', () => {
                for (let opt of ['visible', 'do_not_save', 'advanced', 'priority', 'min', 'max', 'view_max', 'step', 'view_type', 'examples', 'group']) {
                    let elem = document.getElementById(`${paramPrefix}__${opt}`);
                    if (!elem) {
                        continue;
                    }
                    delete elem.dataset.orig_val;
                    let val = this.original_param_types.find(p => p.id == param.id)[opt];
                    if (opt == 'examples') {
                        val = val ? val.join(' || ') : '';
                    }
                    if (opt == 'group') {
                        val = val ? val.id : '';
                    }
                    setInputVal(elem, val);
                    triggerChangeFor(elem);
                }
                delete this.edited_params[param.id];
                delete this.param_edits.params[param.id];
                this.extra_count++;
                this.updateConfirmer();
            });
            for (let opt of ['visible', 'do_not_save', 'advanced', 'priority', 'min', 'max', 'view_max', 'step', 'view_type', 'examples', 'group']) {
                let elem = document.getElementById(`${paramPrefix}__${opt}`);
                if (!elem) {
                    continue;
                }
                elem.dataset.orig_val = getInputVal(elem);
                elem.addEventListener('input', () => {
                    if (!this.edited_params[param.id]) {
                        this.edited_params[param.id] = { changed: {} };
                    }
                    let val = getInputVal(elem);
                    if (`${val}` == elem.dataset.orig_val) {
                        delete this.edited_params[param.id].changed[opt];
                        if (Object.keys(this.edited_params[param.id].changed).length == 0) {
                            delete this.edited_params[param.id];
                        }
                    }
                    else {
                        this.edited_params[param.id].changed[opt] = val;
                    }
                    this.updateConfirmer();
                });
            }
        }
    }

    /** Applies a map of parameter edits provided by the server. */
    applyParamEdits(edits) {
        let doReplace = rawGenParamTypesFromServer == gen_param_types;
        rawGenParamTypesFromServer = JSON.parse(JSON.stringify(this.original_param_types));
        if (doReplace) {
            gen_param_types = rawGenParamTypesFromServer;
        }
        if (!edits) {
            return;
        }
        if (!('groups' in edits)) {
            edits.groups = {};
        }
        if (!('params' in edits)) {
            edits.params = {};
        }
        this.param_edits = edits;
        this.saved_edits = JSON.parse(JSON.stringify(edits));
        for (let param of rawGenParamTypesFromServer) {
            let group = param.original_group || param.group;
            if (group) {
                let groupEdits = edits.groups[group.id];
                if (groupEdits) {
                    for (let key in groupEdits) {
                        group[key] = groupEdits[key];
                    }
                }
            }
            let paramEdits = edits.params[param.id];
            if (paramEdits) {
                for (let key in paramEdits) {
                    if (key == 'examples') {
                        param[key] = paramEdits[key].split('||').map(s => s.trim()).filter(s => s != '');
                    }
                    else if (key == 'group') {
                        if (!param.original_group) {
                            param.original_group = param.group;
                        }
                        param.group = rawGroupMapFromServer[paramEdits[key]];
                    }
                    else {
                        param[key] = paramEdits[key];
                    }
                }
            }
        }
    }

    /** Updates the save/cancel confirm menu. */
    updateConfirmer() {
        let data = Object.values(this.edited_groups).concat(Object.values(this.edited_params)).map(g => Object.keys(g.changed).length);
        let count = (data.length == 0 ? 0 : data.reduce((a, b) => a + b)) + this.extra_count;
        getRequiredElementById(`user_param_config_edit_count`).innerText = count;
        this.confirmer.style.display = count == 0 ? 'none' : 'block';
    }

    /** Saves any edits to parameter settings to the server, and applies them. */
    saveEdits() {
        if (!this.param_edits) {
            this.param_edits = { groups: {}, params: {} };
        }
        for (let groupId in this.edited_groups) {
            let edit = this.edited_groups[groupId];
            if (!this.param_edits.groups[groupId]) {
                this.param_edits.groups[groupId] = {};
            }
            for (let key in edit.changed) {
                this.param_edits.groups[groupId][key] = edit.changed[key];
                let elem = getRequiredElementById(`user_param_config_group_${groupId}__${key}`);
                elem.dataset.orig_val = edit.changed[key];
            }
        }
        for (let paramId in this.edited_params) {
            let edit = this.edited_params[paramId];
            if (!this.param_edits.params[paramId]) {
                this.param_edits.params[paramId] = {};
            }
            for (let key in edit.changed) {
                this.param_edits.params[paramId][key] = edit.changed[key];
                let elem = getRequiredElementById(`user_param_config_param_${paramId}__${key}`);
                elem.dataset.orig_val = edit.changed[key];
            }
        }
        this.edited_groups = [];
        this.edited_params = [];
        this.extra_count = 0;
        this.updateConfirmer();
        this.applyParamEdits(this.param_edits);
        genInputs();
        genericRequest('SetParamEdits', { edits: this.param_edits }, data => {});
    }

    /** Reverts any edits to parameter settings. */
    cancelEdits() {
        for (let groupId in this.edited_groups) {
            let edit = this.edited_groups[groupId];
            for (let key in edit.changed) {
                let input = getRequiredElementById(`user_param_config_group_${groupId}__${key}`);
                setInputVal(input, input.dataset.orig_val);
            }
        }
        for (let paramId in this.edited_params) {
            let edit = this.edited_params[paramId];
            for (let key in edit.changed) {
                let input = getRequiredElementById(`user_param_config_param_${paramId}__${key}`);
                setInputVal(input, input.dataset.orig_val);
            }
        }
        this.edited_groups = [];
        this.edited_params = [];
        this.param_edits = JSON.parse(JSON.stringify(this.saved_edits));
        this.extra_count = 0;
        this.updateConfirmer();
    }
}

/** Instance of ParamConfigurationClass, central handler for user-edited parameters. */
let paramConfig = new ParamConfigurationClass();

async function doPasswordChangeSubmit() {
    let resultArea = getRequiredElementById('change_password_result_area');
    let submitButton = getRequiredElementById('change_password_submit_button');
    let oldPassword = getRequiredElementById('change_password_old_password');
    let newPassword = getRequiredElementById('change_password_new_password');
    let newPassword2 = getRequiredElementById('change_password_new_password2');
    if (newPassword.value != newPassword2.value) {
        resultArea.innerText = 'New passwords do not match';
        return;
    }
    if (newPassword.value == oldPassword.value) {
        resultArea.innerText = 'New password cannot be the same as the old password';
        return;
    }
    if (newPassword.value.length < 8) {
        resultArea.innerText = 'New password must be at least 8 characters long';
        return;
    }
    let oldPwHash = await doPasswordClientPrehash(user_id, oldPassword.value);
    let newPwHash = await doPasswordClientPrehash(user_id, newPassword.value);
    resultArea.innerText = 'Submitting...';
    submitButton.disabled = true;
    genericRequest('ChangePassword', { oldPassword: oldPwHash, newPassword: newPwHash }, data => {
        resultArea.innerText = 'Password changed.';
        setTimeout(() => {
            resultArea.innerText = '';
            oldPassword.value = '';
            newPassword.value = '';
            newPassword2.value = '';
            submitButton.disabled = false;
            $('#change_password_modal').modal('hide');
        }, 1000);
    }, 0, e => {
        resultArea.innerText = 'Error: ' + e;
        submitButton.disabled = false;
    });
}

function doUserLogout() {
    if (!confirm('Are you sure you want to logout? This will close all current sessions originating from this browser.')) {
        return;
    }
    genericRequest('Logout', {}, data => {
        window.location.href = 'Login';
    });
}
