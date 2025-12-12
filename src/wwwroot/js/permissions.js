/** Helper class for tracking the user's permissions. */
class Permissions {
    constructor() {
        this.permissions = {};
        this.permissionedDivs = [];
        this.hasLoaded = false;
        setTimeout(() => {
            this.gather();
        }, 0);
    }

    gather() {
        this.permissionedDivs = [...document.querySelectorAll('[data-requiredpermission]')];
        this.apply();
    }

    updateFrom(set) {
        this.permissions = {};
        for (let key of set) {
            this.permissions[key] = true;
        }
        this.hasLoaded = true;
        this.apply();
    }

    apply() {
        if (!this.hasLoaded) {
            return;
        }
        for (let div of this.permissionedDivs) {
            let key = div.dataset.requiredpermission;
            if (!this.hasPermission(key)) {
                div.style.display = 'none';
            }
            else {
                div.style.display = '';
            }
        }
    }

    hasPermission(key) {
        if (!this.hasLoaded) {
            return true;
        }
        if (key.includes(',')) {
            for (let k of key.split(',')) {
                if (!this.hasPermission(k)) {
                    return false;
                }
            }
            return true;
        }
        return this.permissions[key] || this.permissions['*'];
    }
}

permissions = new Permissions();
