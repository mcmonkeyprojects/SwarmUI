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
        this.leftBox = getRequiredElementById('manage_users_leftbox_content');
        this.rightBox = getRequiredElementById('manage_users_rightbox_content');
        this.addUserMenuInputs = getRequiredElementById('add_user_menu_inputs');
        this.addUserMenuInputs.innerHTML =
            makeGenericPopover('addusermenu_name', 'Username', 'text', "The name to give to the user.\nThis will be used as a unique lookup ID, so keep it simple.\nNo funky symbols, spaces, etc.", '')
            + makeTextInput(null, 'addusermenu_name', '', 'Username', '', '', 'normal', "New user's name...", false, false, true)
            + makeGenericPopover('addusermenu_pass', 'Password', 'text', "Initial password to give to the user. The user will be asked to change this immediately after logging in automatically.", '')
            + makeTextInput(null, 'addusermenu_pass', '', 'Password', '', '', 'password', "New user's password...", false, false, true)
            + makeGenericPopover('addusermenu_role', 'Role', 'dropdown', "Initial role to give to the user. This can be changed later.", '')
            + makeDropdownInput(null, 'addusermenu_role', '', 'Role', '', ['user', 'guest'], 'user', false, true, ['User', 'Guest']);
        this.nameInput = getRequiredElementById('addusermenu_name');
        this.passInput = getRequiredElementById('addusermenu_pass');
        this.roleInput = getRequiredElementById('addusermenu_role');
    }

    onTabButtonClick() {
        genericRequest('AdminListUsers', {}, data => {
            let html = '';
            for (let user of data.users) {
                html += `<div class="admin-user-manage-name" onclick="userAdminManager.clickUser('${escapeHtml(user)}')">${escapeHtml(user)}</div>`;
            }
            this.leftBox.innerHTML = html;
        });
        this.rightBox.innerHTML = `<span class="translate">Welcome, admin! Select a user on the left to configure them.</span><br><br><b>THIS IS A PLACEHOLDER, IT DOES NOT WORK YET</b>`;
    }

    clickUser(name) {
        // TODO
    }

    rebuildRoleList() {
        if (!permissions.hasPermission('configure_roles')) {
            return;
        }
        genericRequest('AdminListRoles', {}, data => {
            let selected = this.roleInput.value;
            let html = '';
            for (let roleId of Object.keys(data.roles)) {
                let role = data.roles[roleId];
                html += `<option value="${escapeHtml(roleId)}" title="${escapeHtml(role.description)}">${escapeHtml(role.name)}</option>`;
            }
            this.roleInput.innerHTML = html;
            this.roleInput.value = selected;
        });
    }

    showAddUserMenu() {
        this.nameInput.value = '';
        this.passInput.value = '';
        this.roleInput.value = 'user';
        this.rebuildRoleList();
        $('#server_add_user_menu').modal('show');
    }

    addUserMenuSubmit() {
        let name = this.nameInput.value;
        if (!name) {
            alert('Please fill in the name field, or cancel');
            return;
        }
        let pass = this.passInput.value;
        let role = this.roleInput.value;
        if (!pass) {
            alert('Please fill in the password field, or cancel');
            return;
        }
        $('#server_add_user_menu').modal('hide');
        genericRequest('AdminAddUser', {'name': name, 'password': pass, 'role': role}, data => {
            this.onTabButtonClick();
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

let restartConfirmationText = translatable("Are you sure you want to update and restart SwarmUI?");
let checkingForUpdatesText = translatable("Checking for updates...");

function update_and_restart_server() {
    let noticeArea = getRequiredElementById('shutdown_notice_area');
    noticeArea.style.display = 'block';
    if (confirm(restartConfirmationText.get())) {
        noticeArea.innerText = checkingForUpdatesText.get();
        genericRequest('UpdateAndRestart', {}, data => {
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
