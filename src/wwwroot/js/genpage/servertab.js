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
            infoDiv.remove();
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
            infoDiv.remove();
            button.disabled = false
        });
    }
}

extensionsManager = new ExtensionsManager();
