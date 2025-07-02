class ExtensionsManager {
    constructor() {
        this.newInstallsCard = getRequiredElementById('extensions_installed_card');
    }

    installExtension(name, button) {
        button.disabled = true;
        let infoDiv = createDiv(null, 'installing_info', 'Installing (check server logs for details)...');
        button.parentElement.querySelectorAll('.installing_info').forEach(e => e.remove());
        button.parentElement.appendChild(infoDiv);
        genericRequest('InstallExtension', {'extensionName': name}, data => {
            button.parentElement.innerHTML = 'Installed, restart to load';
            this.newInstallsCard.style.display = 'block';
        }, 0, e => {
            infoDiv.innerText = 'Failed to install: ' + e;
            button.disabled = false;
        });
    }

    restartServer() {
        let restartButton = getRequiredElementById('extension_restart_button');
        restartButton.disabled = true;
        restartButton.parentElement.appendChild(createDiv(null, null, 'Restarting server... please wait a moment then refresh the page'));
        genericRequest('UpdateAndRestart', {'force': true}, data => {});
    }

    updateExtension(name, button) {
        button.disabled = true;
        button.parentElement.querySelectorAll('.installing_info').forEach(e => e.remove());
        let infoDiv = createDiv(null, 'installing_info', 'Updating (check server logs for details)...');
        button.parentElement.appendChild(infoDiv);
        genericRequest('UpdateExtension', {'extensionName': name}, data => {
            if (data.success) {
                button.parentElement.innerHTML = 'Updated, restart to load';
                this.newInstallsCard.style.display = 'block';
            }
            else {
                button.disabled = false;
                infoDiv.innerText = 'No update available';
            }
        }, 0, e => {
            infoDiv.innerText = 'Failed to update: ' + e;
            button.disabled = false;
        });
    }

    uninstallExtension(name, button) {
        button.disabled = true;
        button.parentElement.querySelectorAll('.installing_info').forEach(e => e.remove());
        let infoDiv = createDiv(null, 'installing_info', 'Uninstalling (check server logs for details)...');
        button.parentElement.appendChild(infoDiv);
        genericRequest('UninstallExtension', {'extensionName': name}, data => {
            button.parentElement.innerHTML = 'Uninstalled, restart to apply';
            this.newInstallsCard.style.display = 'block';
        }, 0, e => {
            infoDiv.innerText = 'Failed to uninstall: ' + e;
            button.disabled = false;
        });
    }
}

extensionsManager = new ExtensionsManager();

class UserAdminManager {
    constructor() {
        this.tabButton = getRequiredElementById('manageusersbutton');
        this.tabButton.addEventListener('click', () => this.onTabButtonClick());
        this.filterBox = getRequiredElementById('admin_user_filter');
        this.filterClear = getRequiredElementById('admin_user_clear_input_icon');
        this.leftBoxRoleList = getRequiredElementById('manage_users_leftbox_content_rolelist');
        this.leftBoxUserList = getRequiredElementById('manage_users_leftbox_content_userlist');
        this.rightBox = getRequiredElementById('manage_users_rightbox_content');
        this.addUserMenuInputs = getRequiredElementById('add_user_menu_inputs');
        this.addUserMenuInputs.innerHTML =
            makeGenericPopover('addusermenu_name', 'Username', 'text', "The name to give to the user.\nThis will be used as a unique lookup ID, so keep it simple.\nNo funky symbols, spaces, etc.", '')
            + makeTextInput(null, 'addusermenu_name', '', 'Username', '', '', 'normal', "New user's name...", false, false, true)
            + makeGenericPopover('addusermenu_pass', 'Password', 'text', "Initial password to give to the user. The user will be asked to change this immediately after logging in automatically.", '')
            + makeTextInput(null, 'addusermenu_pass', '', 'Password', '', '', 'password', "New user's password...", false, false, true)
            + makeGenericPopover('addusermenu_role', 'Role', 'dropdown', "Initial role to give to the user. This can be changed later.", '')
            + makeDropdownInput(null, 'addusermenu_role', '', 'Role', '', ['user', 'guest'], 'user', false, true, ['User', 'Guest']);
        this.addUserNameInput = getRequiredElementById('addusermenu_name');
        this.addUserPassInput = getRequiredElementById('addusermenu_pass');
        this.addUserRoleInput = getRequiredElementById('addusermenu_role');
        this.addRoleMenuInputs = getRequiredElementById('add_role_menu_inputs');
        this.addRoleMenuInputs.innerHTML =
            makeGenericPopover('addrolemenu_name', 'Role Name', 'text', "The name to give to the role.\nThis will be used as a unique lookup ID, so keep it simple.\nNo funky symbols, spaces, etc.", '')
            + makeTextInput(null, 'addrolemenu_name', '', 'Role Name', '', '', 'normal', "New role's name...", false, false, true);
        this.addRoleNameInput = getRequiredElementById('addrolemenu_name');
        this.displayedRole = null;
        this.displayedUser = null;
        this.roles = {};
        this.userNames = [];
        this.permissions_info = null;
        this.permissions_ordered = null;
    }

    updateFilter() {
        this.buildRoleList();
        this.buildUserList();
        this.filterClear.style.display = this.filterBox.value.length > 0 ? 'block' : 'none';
    }

    clearFilter() {
        this.filterBox.value = '';
        this.filterBox.focus();
        this.updateFilter();
    }

    onTabButtonClick() {
        this.rebuildRoleList();
        this.setRightboxDefault();
        genericRequest('AdminListUsers', {}, data => {
            this.userNames = data.users;
            this.buildUserList();
        });
    }

    buildUserList() {
        let html = '';
        for (let user of this.userNames) {
            if (!this.filterBox.value || user.includes(this.filterBox.value)) {
                html += `<div class="admin-user-manage-name" onclick="userAdminManager.clickUser(unescapeHtml('${escapeHtml(user)}'))" title="Click to manage user '${escapeHtml(user)}'">${escapeHtml(user)}</div>`;
            }
        }
        this.leftBoxUserList.innerHTML = html;
    }

    setNothingDisplayed() {
        this.displayedRole = null;
        this.displayedUser = null;
    }

    setStaticRightBox(html) {
        this.setNothingDisplayed();
        this.rightBox.innerHTML = html;
    }

    setRightboxDefault() {
        this.setStaticRightBox(`<span class="translate">Welcome, admin! Select a user on the left to configure them.</span><br><br><b>THIS IS A WORK IN PROGRESS, IT IS NOT COMPLETE YET</b>`);
    }

    setRightboxLoading() {
        this.setStaticRightBox(`<span class="translate">Loading...</span><div class="loading-spinner-parent"><div class="loading-spinner"><div class="loadspin1"></div><div class="loadspin2"></div><div class="loadspin3"></div></div></div>`);
        uiImprover.runLoadSpinner(this.rightBox);
    }

    clickUser(name) {
        this.setRightboxLoading();
        // TODO
        this.setNothingDisplayed();
        this.displayedUser = name;
        this.curUserSettingsEditTracker = {
            known: {},
            altered: {}
        };
        let prefix = `admin_edit_user_${escapeHtml(name)}_settings_`;
        this.rightBox.innerHTML = `<div class="admin-user-right-titlebar">User: <span class="admin-user-right-titlebar-name">${escapeHtml(name)}</span></div>`
            + (name == user_id ? `<div class="admin-user-manage-notice translate">This is you! You shouldn't admin-edit yourself.</div>` : `<button type="button" class="basic-button translate" onclick="userAdminManager.deleteUser(unescapeHtml('${escapeHtml(name)}'))">Delete User</button>`)
            + `<br><br><button type="button" class="basic-button translate" onclick="userAdminManager.editUserPw(unescapeHtml('${escapeHtml(name)}'))">Change User Password</button>`
            + `<br><br><div class="admin_edit_user_settings_container" id="admin_edit_user_settings_container"></div>
            <div class="settings_submit_confirmer" id="${prefix}confirmer">
                <span class="settings_submit_confirmer_text">Save <span id="${prefix}edit_count">0</span> edited setting(s)?</span>
                <button type="button" class="btn btn-primary basic-button translate" onclick="userAdminManager.saveUserSettings()">Save</button>
                <button type="button" class="btn btn-secondary basic-button translate" onclick="userAdminManager.cancelUserSettings()">Cancel</button>
            </div>`;
        let userSettingsContainer = getRequiredElementById('admin_edit_user_settings_container');
        genericRequest('AdminGetUserInfo', {'name': name}, data => {
            if (this.displayedUser != name) {
                return;
            }
            buildSettingsMenu(userSettingsContainer, data.settings, prefix, this.curUserSettingsEditTracker);
        });
    }

    saveUserSettings() {
        genericRequest('AdminChangeUserSettings', { name: this.displayedUser, settings: this.curUserSettingsEditTracker.altered }, data => {
            getRequiredElementById(`admin_edit_user_${escapeHtml(this.displayedUser)}_settings_confirmer`).style.display = 'none';
            this.clickUser(this.displayedUser);
        });
    }

    cancelUserSettings() {
        doSettingsReset(`admin_edit_user_${escapeHtml(this.displayedUser)}_settings_`, this.curUserSettingsEditTracker);
    }

    editUserPw(name) {
        this.displayedUser = name;
        $('#server_change_user_password_modal').modal('show');
    }

    async changeUserPwSubmit() {
        let resultArea = getRequiredElementById('server_change_user_password_result_area');
        let submitButton = getRequiredElementById('server_change_user_password_submit_button');
        let newPassword = getRequiredElementById('server_change_user_password_new_password');
        let newPassword2 = getRequiredElementById('server_change_user_password_new_password2');
        if (newPassword.value != newPassword2.value) {
            resultArea.innerText = 'New passwords do not match';
            return;
        }
        if (newPassword.value.length < 8) {
            resultArea.innerText = 'New password must be at least 8 characters long';
            return;
        }
        resultArea.innerText = 'Submitting...';
        submitButton.disabled = true;
        let pwHash = await doPasswordClientPrehash(this.displayedUser, newPassword.value);
        genericRequest('AdminSetUserPassword', {'name': this.displayedUser, 'password': pwHash}, data => {
            resultArea.innerText = 'Password changed.';
            setTimeout(() => {
                resultArea.innerText = '';
                newPassword.value = '';
                newPassword2.value = '';
                submitButton.disabled = false;
                $('#server_change_user_password_modal').modal('hide');
            }, 1000);
        }, 0, e => {
            resultArea.innerText = 'Error: ' + e;
            submitButton.disabled = false;
        });
    }

    deleteUser(name) {
        if (!confirm(`Are you sure you want to delete the user '${name}'?\nThis action cannot be undone.\nMost user data will be lost. Image outputs will remain on drive. Changes outside of user personal data will remain.`)) {
            return;
        }
        genericRequest('AdminDeleteUser', {'name': name}, data => {
            this.onTabButtonClick();
            this.setStaticRightBox(`<span class="translate">User deleted successfully</span>`);
        });
    }

    roleSettingMap = {
        'description': 'adminrolemenu_description',
        'max_outpath_depth': 'adminrolemenu_maxoutpathdepth',
        'max_t2i_simultaneous': 'adminrolemenu_maxt2isimultaneous',
        'allow_unsafe_outpaths': 'adminrolemenu_allowunsafeoutpaths',
        'model_whitelist': 'adminrolemenu_modelwhitelist',
        'model_blacklist': 'adminrolemenu_modelblacklist'
    };

    clickRole(roleId) {
        this.setRightboxLoading();
        genericRequest('AdminListRoles', {}, data => {
            if (!(roleId in data.roles)) {
                this.setStaticRightBox(`<span class="translate">Role not found, something went wrong</span>`);
                return;
            }
            let role = data.roles[roleId];
            let html = `<div class="admin-user-right-titlebar">Role: <span class="admin-user-right-titlebar-name">${escapeHtml(role.name)}</span></div>`
                + (role.is_auto_generated ? `<div class="admin-user-manage-notice translate">This is an auto-generated role. It may not be deleted, and some automations may apply to it (such as new permissions automatically enabling when first loaded).</div>` : `<button type="button" class="basic-button translate" onclick="userAdminManager.deleteRole('${escapeHtml(roleId)}')">Delete Role</button>`)
                + '<br><br>'
                + makeGenericPopover('adminrolemenu_description', 'Description', 'text', "Human-readable description text about this role.\nThis is for admin reference when picking roles.\nProbably describe here when/why a user should receive this role, and a short bit about what it unlocks.", '')
                + makeTextInput(null, 'adminrolemenu_description', '', 'Description', '', '', 'big', "Role description...", false, false, true)
                + makeGenericPopover('adminrolemenu_maxoutpathdepth', 'Max OutPath Depth', 'number', "How many directories deep a user's custom OutPath can be.\nDefault is 5.\nThis is just a minor protection to avoid filesystem corruption. Higher values are perfectly fine in most cases.\nThe actual limit applied to a user is whatever the highest value of all their roles is.", '')
                + makeNumberInput(null, 'adminrolemenu_maxoutpathdepth', '', 'Max OutPath Depth', '', 5, 1, 100, 1, 'normal', false, true)
                + makeGenericPopover('adminrolemenu_maxt2isimultaneous', 'Max T2I Simultaneous', 'number', "How many images this user can have actively generating at once.\nDefault is 32.\nThis is naturally sub-limited by the number of available backends.\nThis is a protection for many-backend servers, to guarantee one user cannot steal all backends at once.\nYou can set this to a very low value if you have few backends but many users.\nSet this to a very high value if you have many backends and no concern for their distribution.\nThe actual limit applied to a user is whatever the highest value of all their roles is.", '')
                + makeNumberInput(null, 'adminrolemenu_maxt2isimultaneous', '', 'Max T2I Simultaneous', '', 32, 1, 10000, 1, 'normal', false, true)
                + makeGenericPopover('adminrolemenu_allowunsafeoutpaths', 'Allow Unsafe OutPaths', 'checkbox', "Whether the '.' symbol can be used in OutPath - if enabled, users may cause file system issues or perform folder escapes.", '')
                + makeCheckboxInput(null, 'adminrolemenu_allowunsafeoutpaths', '', 'Allow Unsafe OutPaths', '', false, false, true)
                + makeGenericPopover('adminrolemenu_modelwhitelist', 'Model Whitelist', 'text', "What models are allowed, as a list of prefixes.\nFor example 'sdxl/' allows only models in the SDXL folder.\nOr, 'sdxl/,flux/' allows models in the SDXL or Flux folders.\nIf empty, no whitelist logic is applied.\nNote that blacklist is 'more powerful' than whitelist and overrides it.\nThis stacks between roles, roles can add whitelist entries together.", '')
                + makeTextInput(null, 'adminrolemenu_modelwhitelist', '', 'Model Whitelist', '', '', 'normal', "Model Whitelist...", false, false, true)
                + makeGenericPopover('adminrolemenu_modelblacklist', 'Model Blacklist', 'text', "What models are forbidden, as a list of prefixes.\nFor example 'sdxl/' forbids models in the SDXL folder.\nOr, 'sdxl/,flux/' forbids models in the SDXL or Flux folders.\nIf empty, no blacklist logic is applied.\nNote that blacklist is 'more powerful' than whitelist and overrides it.\nThis stacks between roles, roles can add blacklist entries together.", '')
                + makeTextInput(null, 'adminrolemenu_modelblacklist', '', 'Model Blacklist', '', '', 'normal', "Model Blacklist...", false, false, true)
                + '\n<br><hr><br>\n<h4 class="translate">Permissions</h4><br>\n'
                + `<div class="settings_submit_confirmer" id="adminrolemenu_confirmer">
                    <span class="settings_submit_confirmer_text">Save <span id="adminrolemenu_edit_count">0</span> edited setting(s)?</span>
                    <button type="button" class="btn btn-primary basic-button translate" onclick="userAdminManager.saveRoleSettings()">Save</button>
                    <button type="button" class="btn btn-secondary basic-button translate" onclick="userAdminManager.cancelRoleSettings()">Cancel</button>
                </div>`;
            let lastGroupName = null;
            let isFirst = true;
            for (let perm of this.permissions_ordered) {
                let permInfo = this.permissions_info[perm];
                if (lastGroupName != permInfo.group.name) {
                    lastGroupName = permInfo.group.name;
                    let groupId = `adminrolemenu_permgroup_${lastGroupName}`;
                    let [groupPopover, _] = getPopoverElemsFor(groupId, true);
                    if (!isFirst) {
                        html += '</table></div>';
                    }
                    isFirst = false;
                    html += `<div class="admin_perm_group">
                            ${makeGenericPopover(groupId, permInfo.group.name, 'checkbox', permInfo.group.description, '')}
                            <h5 class="translate">
                                ${translateableHtml(permInfo.group.name)}${groupPopover}
                            </h5>
                        <table class="simple-table">`;
                }
                let id = `adminrolemenu_perm_${perm}`;
                let [popover, _] = getPopoverElemsFor(id, true);
                html +=
                    `<tr>
                        <td>
                        ${makeGenericPopover(id, permInfo.name, 'checkbox', permInfo.description, '')}
                        <span class="translate" title="${perm}">${translateableHtml(permInfo.name)}</span>${popover}
                        </td>
                        <td>
                            <span class="form-check form-switch toggle-switch display-inline-block"><input class="auto-slider-toggle form-check-input" type="checkbox" id="${id}_toggle" title="Enable/disable ${perm}" autocomplete="off"${(role.permissions.includes(perm) ? ' checked' : '')} onchange="userAdminManager.checkShowRoleEditConfirm()"><div class="auto-slider-toggle-content"></div></span>
                        </td>
                    </tr>`;
            }
            html += '</table></div>';
            this.setNothingDisplayed();
            this.roles = data.roles;
            this.displayedRole = roleId;
            this.rightBox.innerHTML = html;
            let descriptionBox = getRequiredElementById('adminrolemenu_description');
            descriptionBox.value = role.description;
            dynamicSizeTextBox(descriptionBox);
            for (let key in this.roleSettingMap) {
                let elem = getRequiredElementById(this.roleSettingMap[key]);
                elem.addEventListener('input', () => {
                    this.checkShowRoleEditConfirm();
                });
                let val = role[key];
                if (Array.isArray(val)) {
                    val = val.join(', ');
                }
                if (elem.type == 'checkbox') {
                    elem.checked = val;
                }
                else {
                    elem.value = val;
                }
            }
        });
    }

    saveRoleSettings() {
        let role = this.roles[this.displayedRole];
        let inData = {
            'name': this.displayedRole
        };
        for (let key in this.roleSettingMap) {
            let elem = getRequiredElementById(this.roleSettingMap[key]);
            let val;
            if (elem.type == 'checkbox') {
                val = elem.checked;
            }
            else {
                val = elem.value;
            }
            inData[key] = val;
        }
        let permissions = [];
        for (let perm of this.permissions_ordered) {
            let isChecked = getRequiredElementById(`adminrolemenu_perm_${perm}_toggle`).checked;
            if (isChecked) {
                permissions.push(perm);
            }
        }
        inData['permissions'] = permissions.join(',');
        genericRequest('AdminEditRole', inData, data => {
            this.clickRole(this.displayedRole);
        });
    }

    cancelRoleSettings() {
        let role = this.roles[this.displayedRole];
        for (let key in this.roleSettingMap) {
            let elem = getRequiredElementById(this.roleSettingMap[key]);
            let val = role[key];
            if (Array.isArray(val)) {
                val = val.join(', ');
            }
            if (elem.type == 'checkbox') {
                elem.checked = val;
            }
            else {
                elem.value = val;
            }
        }
        for (let perm of this.permissions_ordered) {
            getRequiredElementById(`adminrolemenu_perm_${perm}_toggle`).checked = role.permissions.includes(perm);
        }
        getRequiredElementById('adminrolemenu_confirmer').style.display = 'none';
    }

    checkShowRoleEditConfirm() {
        let shouldShow = false;
        let role = this.roles[this.displayedRole];
        let count = 0;
        for (let key in this.roleSettingMap) {
            let elem = getRequiredElementById(this.roleSettingMap[key]);
            let roleVal = role[key];
            if (Array.isArray(roleVal)) {
                roleVal = roleVal.join(', ');
            }
            let elemVal;
            if (elem.type == 'checkbox') {
                elemVal = elem.checked;
            }
            else {
                elemVal = elem.value;
            }
            if (roleVal != elemVal) {
                shouldShow = true;
                count++;
            }
        }
        for (let perm of this.permissions_ordered) {
            let isChecked = getRequiredElementById(`adminrolemenu_perm_${perm}_toggle`).checked;
            if (isChecked != role.permissions.includes(perm)) {
                shouldShow = true;
                count++;
            }
        }
        getRequiredElementById('adminrolemenu_confirmer').style.display = shouldShow ? 'block' : 'none';
        getRequiredElementById('adminrolemenu_edit_count').innerText = count;
    }

    deleteRole(roleId) {
        if (!confirm(`Are you sure you want to delete the role '${roleId}'?\nThis action cannot be undone.`)) {
            return;
        }
        genericRequest('AdminDeleteRole', {'name': roleId}, data => {
            this.onTabButtonClick();
            this.setStaticRightBox(`<span class="translate">Role deleted successfully</span>`);
        });
    }

    rebuildRoleList() {
        if (!permissions.hasPermission('configure_roles')) {
            return;
        }
        if (!this.permissions_info) {
            genericRequest('AdminListPermissions', {}, data => {
                this.permissions_info = data.permissions;
                this.permissions_ordered = data.ordered;
                this.rebuildRoleList();
            });
            return;
        }
        genericRequest('AdminListRoles', {}, data => {
            this.roles = data.roles;
            let selected = this.addUserRoleInput.value;
            let optionListHtml = '';
            for (let roleId of Object.keys(data.roles)) {
                let role = data.roles[roleId];
                optionListHtml += `<option value="${escapeHtml(roleId)}" title="${escapeHtml(role.description)}">${escapeHtml(role.name)}</option>`;
            }
            this.addUserRoleInput.innerHTML = optionListHtml;
            this.addUserRoleInput.value = selected;
            this.buildRoleList();
        });
    }

    buildRoleList() {
        let roleListHtml = '';
        for (let roleId of Object.keys(this.roles)) {
            let role = this.roles[roleId];
            if (!this.filterBox.value || role.name.includes(this.filterBox.value) || roleId.includes(this.filterBox.value)) {
                roleListHtml += `<div class="admin-user-manage-name" onclick="userAdminManager.clickRole('${escapeHtml(roleId)}')" title="${escapeHtml(role.description)}">${escapeHtml(role.name)}</div>`;
            }
        }
        this.leftBoxRoleList.innerHTML = roleListHtml;
    }

    showAddUserMenu() {
        this.addUserNameInput.value = '';
        this.addUserPassInput.value = '';
        this.addUserRoleInput.value = 'user';
        this.rebuildRoleList();
        $('#server_add_user_menu').modal('show');
    }

    async addUserMenuSubmit() {
        let name = this.addUserNameInput.value;
        if (!name) {
            alert('Please fill in the name field, or cancel');
            return;
        }
        let pass = this.addUserPassInput.value;
        let role = this.addUserRoleInput.value;
        if (!pass) {
            alert('Please fill in the password field, or cancel');
            return;
        }
        if (pass.length < 8) {
            alert('New password must be at least 8 characters long');
            return;
        }
        $('#server_add_user_menu').modal('hide');
        let password = await doPasswordClientPrehash(name, pass);
        genericRequest('AdminAddUser', {'name': name, 'password': password, 'role': role}, data => {
            this.onTabButtonClick();
        });
    }

    showAddRoleMenu() {
        this.addRoleNameInput.value = '';
        this.rebuildRoleList();
        $('#server_add_role_menu').modal('show');
    }

    addRoleMenuSubmit() {
        let name = this.addRoleNameInput.value;
        if (!name) {
            alert('Please fill in the name field, or cancel');
            return;
        }
        $('#server_add_role_menu').modal('hide');
        genericRequest('AdminAddRole', {'name': name}, data => {
            this.rebuildRoleList();
        });
    }
}

userAdminManager = new UserAdminManager();

//// TODO: Put these in classes

let shutdownConfirmationText = translatable("Are you sure you want to shut SwarmUI down?");

function shutdown_server() {
    if (confirm(shutdownConfirmationText.get())) {
        genericRequest('ShutdownServer', {}, data => {
            close();
        });
    }
}

let checkingForUpdatesText = translatable("Checking for updates...");
let updatesAvailableText = translatable("update(s) available for SwarmUI:");
let extensionsAvailableText = translatable("extensions can be updated:");

let hasEverCheckedForUpdates = false;

function check_for_updates() {
    if (!permissions.hasPermission('restart')) {
        return;
    }
    let updatesCard = getRequiredElementById('server_updates_card');
    let noticeArea = getRequiredElementById('updates_available_notice_area');
    noticeArea.innerText = checkingForUpdatesText.get();
    hasEverCheckedForUpdates = true;
    genericRequest('CheckForUpdates', {}, data => {
        let text = '';
        if (data.server_updates_count > 0) {
            text += `${data.server_updates_count} ${updatesAvailableText.get()}\n"${data.server_updates_preview.join('",\n "')}"`;
        }
        if (data.extension_updates.length > 0) {
            text += `\n${data.extension_updates.length} ${extensionsAvailableText.get()}\n"${data.extension_updates.join('",\n "')}"`;
        }
        // TODO: Backend updates
        updatesCard.classList.remove('border-secondary');
        updatesCard.classList.remove('border-success');
        if (!text) {
            text = 'No updates available';
            updatesCard.classList.add('border-secondary');
        }
        else {
            updatesCard.classList.add('border-success');
        }
        noticeArea.innerText = text.trim();
    }, 0, e => {
        noticeArea.innerText = e;
    });
}

let restartConfirmationText = translatable("Are you sure you want to update and restart SwarmUI?");

function update_and_restart_server() {
    let noticeArea = getRequiredElementById('update_server_notice_area');
    let includeExtensions = getRequiredElementById('server_update_include_extensions').checked;
    noticeArea.style.display = 'block';
    if (confirm(restartConfirmationText.get())) {
        noticeArea.innerText = checkingForUpdatesText.get();
        genericRequest('UpdateAndRestart', { 'updateExtensions': includeExtensions }, data => {
            noticeArea.innerText = data.result;
        }, 0, e => {
            noticeArea.innerText = e;
        });
    }
}

function server_clear_vram() {
    genericRequest('FreeBackendMemory', { 'system_ram': false }, data => {});
}

function server_clear_sysram() {
    genericRequest('FreeBackendMemory', { 'system_ram': true }, data => {});
}

function serverResourceLoop() {
    if (isVisible(getRequiredElementById('Server-Info'))) {
        if (!hasEverCheckedForUpdates) {
            if (window.checkForUpdatesAutomatically) {
                check_for_updates();
            }
            else {
                hasEverCheckedForUpdates = true;
                getRequiredElementById('updates_available_notice_area').innerText = 'Automatic update checks disabled in Server Configuration';
            }
        }
        genericRequest('GetServerResourceInfo', {}, data => {
            let target = getRequiredElementById('resource_usage_area');
            let priorWidth = 0;
            if (target.style.minWidth) {
                priorWidth = parseFloat(target.style.minWidth.replaceAll('px', ''));
            }
            target.style.minWidth = `${Math.max(priorWidth, target.offsetWidth)}px`;
            if (data.gpus) {
                let html = '<table class="simple-table"><tr><th>Resource</th><th>ID</th><th>Temp</th><th>Usage</th><th>Mem Usage</th><th>Used Mem</th><th>Free Mem</th><th>Total Mem</th></tr>';
                html += `<tr><td>CPU</td><td>...</td><td>...</td><td>${Math.round(data.cpu.usage * 100)}% (${data.cpu.cores} cores)</td><td>${Math.round(data.system_ram.used / data.system_ram.total * 100)}%</td><td>${fileSizeStringify(data.system_ram.used)}</td><td>${fileSizeStringify(data.system_ram.free)}</td><td>${fileSizeStringify(data.system_ram.total)}</td></tr>`;
                for (let gpu of Object.values(data.gpus)) {
                    html += `<tr><td>${gpu.name}</td><td>${gpu.id}</td><td>${gpu.temperature}&deg;C</td><td>${gpu.utilization_gpu}% Core, ${gpu.utilization_memory}% Mem</td><td>${Math.round(gpu.used_memory / gpu.total_memory * 100)}%</td><td>${fileSizeStringify(gpu.used_memory)}</td><td>${fileSizeStringify(gpu.free_memory)}</td><td>${fileSizeStringify(gpu.total_memory)}</td></tr>`;
                }
                html += '</table>';
                target.innerHTML = html;
            }
        });
        genericRequest('ListConnectedUsers', {}, data => {
            let target = getRequiredElementById('connected_users_list');
            let priorWidth = 0;
            if (target.style.minWidth) {
                priorWidth = parseFloat(target.style.minWidth.replaceAll('px', ''));
            }
            target.style.minWidth = `${Math.max(priorWidth, target.offsetWidth)}px`;
            let html = '<table class="simple-table"><tr><th>Name</th><th>Last Active</th><th>Active Sessions</th></tr>';
            for (let user of data.users) {
                html += `<tr><td>${user.id}</td><td>${user.last_active}</td><td>${user.active_sessions.map(sess => `${sess.count}x from ${sess.address}`).join(', ')}</td></tr>`;
            }
            html += '</table>';
            target.innerHTML = html;
        });
    }
    if (isVisible(backendsListView)) {
        backendLoopUpdate();
    }
}
