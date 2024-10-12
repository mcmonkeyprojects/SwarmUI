class ExtensionsManager {
    constructor() {
        this.newInstallsCard = getRequiredElementById('extensions_installed_card');
    }

    installExtension(name, button) {
        button.disabled = true;
        let infoDiv = createDiv(null, 'installing_info', 'Installing (check server logs for details)...');
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
        genericRequest('UpdateAndRestart', {'force': true}, data => {});
    }
}

extensionsManager = new ExtensionsManager();
