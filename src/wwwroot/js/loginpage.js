class LoginHandler {
    constructor() {
        this.usernameInput = document.getElementById('username_input');
        this.passwordInput = document.getElementById('password_input');
        this.loginButton = document.getElementById('login_button');
        this.loginErrorBlock = document.getElementById('login_error_block');
        this.errorNoUsername = translatable("Please enter a valid username.");
        this.errorNoPassword = translatable("Please enter a valid password.");
        this.errorLoginFailedUnknown = translatable("Login failed (reason unknown), please check your inputs and try again.\nIf this issue persists, please contact the instance owner.");
        this.errorLoginFailedGeneral = translatable("Login failed (incorrect username or password), please check your inputs and try again.");
        this.errorLoginFailedRatelimit = translatable("Login failed (ratelimit reached), please wait a minute before trying again.");
        this.messageLoggingIn = translatable("Logging in, please wait...");
        this.messageLoginSuccess = translatable("Login successful! Redirecting...");
    }

    showError(message) {
        this.loginErrorBlock.classList.add('login-error-block');
        this.loginErrorBlock.textContent = message;
    }

    showMessage(message) {
        this.loginErrorBlock.classList.remove('login-error-block');
        this.loginErrorBlock.textContent = message;
    }

    async doLogin() {
        let username = this.usernameInput.value;
        let password = this.passwordInput.value;
        if (username.length < 3) {
            this.showError(this.errorNoUsername.get());
            return;
        }
        if (password.length < 8) {
            this.showError(this.errorNoPassword.get());
            return;
        }
        this.showMessage(this.messageLoggingIn.get());
        let inData = {
            username: username,
            password: await doPasswordClientPrehash(username, password)
        };
        this.loginButton.disabled = true;
        sendJsonToServer(`API/Login`, inData, (status, data) => {
            data ??= {};
            if (data.success) {
                this.showMessage(this.messageLoginSuccess.get());
                setTimeout(() => {
                    this.loginErrorBlock.innerHTML = `<a href="./">(Click here if you haven't already been redirected)</a>`;
                    window.location.href = './';
                }, 1000);
                return;
            }
            this.loginButton.disabled = false;
            if (data.error_id == 'invalid_login') {
                this.showError(this.errorLoginFailedGeneral.get());
            }
            else if (data.error_id == 'ratelimit') {
                this.showError(this.errorLoginFailedRatelimit.get());
            }
            else {
                this.showError(this.errorLoginFailedUnknown.get());
            }
        });
    }
}

let loginHandler = new LoginHandler();
