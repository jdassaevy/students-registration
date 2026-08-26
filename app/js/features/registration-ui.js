(() => {
    if (typeof document === 'undefined') return;

    const byId = id => document.getElementById(id);
    const registerFields = byId('registerAcademyFields');
    const toggle = byId('toggleAuthMode');
    const forgot = byId('forgotPassword');
    const form = byId('authForm');
    const authEmail = byId('authEmail');
    const authPassword = byId('authPassword');
    let registering = false;

    if (!registerFields || !toggle || !form) return;

    const signupInputs = [...registerFields.querySelectorAll('input')];

    function setRegistrationVisibility(enabled) {
        registering = enabled;
        registerFields.hidden = !enabled;

        const emailField = byId('emailField');
        const passwordField = byId('passwordField');
        const confirmPasswordField = byId('confirmPasswordField');

        if (emailField) emailField.hidden = enabled;
        if (passwordField) passwordField.hidden = enabled;
        if (confirmPasswordField && enabled) confirmPasswordField.hidden = true;

        signupInputs.forEach(input => {
            input.required = enabled;
        });

        if (authEmail) authEmail.required = !enabled;
        if (authPassword) authPassword.required = !enabled;
    }

    function showRegistration() {
        if (typeof setAuthMode === 'function') setAuthMode('register');
        setRegistrationVisibility(true);
        toggle.textContent = 'Já tenho uma conta';
    }

    function showLogin() {
        if (typeof setAuthMode === 'function') setAuthMode('login');
        setRegistrationVisibility(false);
        toggle.textContent = 'Criar uma conta';
    }

    function normalizeBrazilPhone(value) {
        let digits = String(value || '').replace(/\D/g, '');
        if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
        if (![12, 13].includes(digits.length) || !digits.startsWith('55')) {
            throw new Error('Informe um telefone/WhatsApp válido com DDD.');
        }
        return digits;
    }

    toggle.onclick = () => {
        if (registering) showLogin();
        else showRegistration();
    };

    forgot?.addEventListener('click', () => {
        registering = false;
        setRegistrationVisibility(false);
    });

    form.addEventListener('submit', async event => {
        if (!registering) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const button = byId('authSubmit');
        try {
            if (typeof setLoading === 'function') setLoading(button, true, 'Criando conta...');
            if (typeof authMessage === 'function') authMessage('');

            const academyName = byId('signupAcademyName').value.trim();
            const responsibleName = byId('signupResponsibleName').value.trim();
            const phone = normalizeBrazilPhone(byId('signupPhone').value);
            const email = byId('signupEmail').value.trim();
            const password = byId('signupPassword').value;
            const passwordConfirm = byId('signupPasswordConfirm').value;

            if (!academyName) throw new Error('Informe o nome da academia.');
            if (!responsibleName) throw new Error('Informe o nome do professor responsável.');
            if (!email) throw new Error('Informe seu e-mail.');
            if (password.length < 6) throw new Error('Password should be at least 6 characters');
            if (password !== passwordConfirm) throw new Error('Passwords do not match');

            const { error } = await db.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.origin,
                    data: {
                        academy_name: academyName,
                        responsible_name: responsibleName,
                        phone
                    }
                }
            });

            if (error) throw error;

            showLogin();
            if (typeof authMessage === 'function') {
                authMessage('Conta criada! Confira seu e-mail para confirmar o acesso.', true);
            }
        } catch (error) {
            const message = typeof translateError === 'function'
                ? translateError(error.message)
                : error.message;
            if (typeof authMessage === 'function') authMessage(message);
        } finally {
            if (typeof setLoading === 'function') setLoading(button, false, '');
        }
    }, true);

    setRegistrationVisibility(false);
})();
