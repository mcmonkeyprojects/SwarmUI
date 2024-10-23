/** Helper class for tracking the user's permissions. */
class Permissions {
    constructor() {
        this.permissions = {};
    }

    updateFrom(set) {
        this.permissions = {};
        for (let key in set) {
            this.permissions[key] = true;
        }
    }

    hasPermission(key) {
        return this.permissions[key] || this.permissions['*'];
    }
}

permissions = new Permissions();
