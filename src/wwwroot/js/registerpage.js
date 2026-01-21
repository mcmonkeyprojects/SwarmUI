class RegisterHandler {
    constructor() {
        this.usernameInput = document.getElementById('username_input');
        this.passwordInput = document.getElementById('password_input');
        this.confirmPasswordInput = document.getElementById('confirm_password_input');
        this.registerButton = document.getElementById('register_button');
        this.registerErrorBlock = document.getElementById('register_error_block');
        this.simpleRegisterContainer = document.getElementById('simple-register-container');
        this.messageRegistering = translatable("Registering...");
        this.messageRegisterSuccess = translatable("Registration successful! Redirecting...");
        this.errorPasswordMatch = translatable("Passwords do not match.");
        this.errorUsernameTooShort = translatable("Username is too short. Must be at least 3 characters long.");
        this.errorPasswordTooShort = translatable("Password is too short. Must be at least 8 characters long.");
        this.errorInvalidInput = translatable("Invalid input, such as unreasonable or very long values. Please check your inputs and try again.");
        this.errorRateLimit = translatable("Registration failed (ratelimit reached), please wait a minute before trying again.");
        this.errorUsernameAlreadyExists = translatable("Username already exists (or is reserved). Note that usernames should generally be A-Z plaintext. Please choose a different username.");
        this.errorUnknown = translatable("Registration failed (reason unknown), please check your inputs and try again.\nIf this issue persists, please contact the instance owner.");
        if (!passwordRegistrationEnabled && this.simpleRegisterContainer) {
            this.simpleRegisterContainer.style.display = 'none';
        }
        if (passwordRegistrationEnabled && this.confirmPasswordInput) {
            this.confirmPasswordInput.addEventListener('keydown', (e) => {
                if (e.key == 'Enter') {
                    this.registerButton.click();
                }
            });
        }
    }

    showError(message) {
        this.registerErrorBlock.classList.add('login-error-block');
        this.registerErrorBlock.textContent = message;
    }

    showMessage(message) {
        this.registerErrorBlock.classList.remove('login-error-block');
        this.registerErrorBlock.textContent = message;
    }

    async doRegisterBasic() {
        if (!passwordRegistrationEnabled) {
            this.showError("Password registration is not enabled.");
            return;
        }
        if (this.passwordInput.value != this.confirmPasswordInput.value) {
            this.showError(this.errorPasswordMatch.get());
            return;
        }
        if (this.usernameInput.value.length < 3) {
            this.showError(this.errorUsernameTooShort.get());
            return;
        }
        if (this.passwordInput.value.length < 8) {
            this.showError(this.errorPasswordTooShort.get());
            return;
        }
        this.showMessage(this.messageRegistering.get());
        let username = this.usernameInput.value.trim();
        let password = this.passwordInput.value.trim();
        let inData = {
            username: username,
            password: await doPasswordClientPrehash(username, password)
        };
        this.registerButton.disabled = true;
        sendJsonToServer(`API/RegisterBasic`, inData, (status, data) => {
            data ??= {};
            if (data.success) {
                this.showMessage(this.messageRegisterSuccess.get());
                setTimeout(() => {
                    this.registerErrorBlock.innerHTML = `<a href="Login">(Click here if you haven't already been redirected)</a>`;
                    window.location.href = 'Login';
                }, 1000);
                return;
            }
            this.registerButton.disabled = false;
            if (data.error_id == 'invalid_input') {
                this.showError(this.errorInvalidInput.get());
            }
            else if (data.error_id == 'ratelimit') {
                this.showError(this.errorRateLimit.get());
            }
            else if (data.error_id == 'username_exists') {
                this.showError(this.errorUsernameAlreadyExists.get());
            }
            else {
                this.showError(this.errorUnknown.get());
            }
        });
    }

    async doRegisterOAuth(type) {
        if (!oAuthRegistrationEnabled) {
            this.showError("OAuth registration is not enabled.");
            return;
        }
        if (!oauthTrackerKey) {
            this.showError("OAuth registration is not properly connected.");
            return;
        }
        if (this.usernameInput.value.length < 3) {
            this.showError(this.errorUsernameTooShort.get());
            return;
        }
        this.showMessage(this.messageRegistering.get());
        let username = this.usernameInput.value.trim();
        let inData = {
            username: username,
            oauth_tracker_key: oauthTrackerKey,
            oauth_type: type
        };
        this.registerButton.disabled = true;
        sendJsonToServer(`API/RegisterOAuth`, inData, (status, data) => {
            data ??= {};
            if (data.success) {
                this.showMessage(this.messageRegisterSuccess.get());
                setTimeout(() => {
                    this.registerErrorBlock.innerHTML = `<a href="Login">(Click here if you haven't already been redirected)</a>`;
                    window.location.href = 'Login';
                }, 1000);
                return;
            }
            this.registerButton.disabled = false;
            if (data.error_id == 'invalid_input') {
                this.showError(this.errorInvalidInput.get());
            }
            else if (data.error_id == 'ratelimit') {
                this.showError(this.errorRateLimit.get());
            }
            else if (data.error_id == 'username_exists') {
                this.showError(this.errorUsernameAlreadyExists.get());
            }
            else {
                this.showError(this.errorUnknown.get());
            }
        });
    }
}

let registerHandler = new RegisterHandler();
