(() => {
    if (typeof document === 'undefined') return;

    const byId = id => document.getElementById(id);

    function registerFieldsMarkup() {
        return `
        <div id="registerAcademyFields" class="register-academy-fields" hidden>
            <div class="field"><label for="signupAcademyName">Nome da academia</label><input id="signupAcademyName" maxlength="160" autocomplete="organization"></div>
            <div class="field"><label for="signupResponsibleName">Nome do professor responsável</label><input id="signupResponsibleName" maxlength="160" autocomplete="name"></div>
            <div class="field"><label for="signupPhone">Telefone / WhatsApp</label><input id="signupPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex.: (48) 99999-9999"></div>
            <div class="field"><label for="signupEmail">E-mail</label><input id="signupEmail" type="email" autocomplete="email"></div>
            <div class="field"><label for="signupPassword">Senha</label><input id="signupPassword" type="password" minlength="6" autocomplete="new-password"></div>
            <div class="field"><label for="signupPasswordConfirm">Confirmar senha</label><input id="signupPasswordConfirm" type="password" minlength="6" autocomplete="new-password"></div>
        </div>`;
    }

    function onboardingMarkup() {
        return `
        <dialog id="profileOnboardingModal" class="profile-onboarding-modal">
            <div class="modal-head"><div><h2>Complete seu perfil</h2><p>Precisamos identificar sua academia antes de continuar.</p></div></div>
            <form id="profileOnboardingForm">
                <div class="grid">
                    <div class="field wide"><label for="onboardingAcademyName">Nome da academia</label><input id="onboardingAcademyName" maxlength="160" required></div>
                    <div class="field"><label for="onboardingResponsibleName">Professor responsável</label><input id="onboardingResponsibleName" maxlength="160" required></div>
                    <div class="field"><label for="onboardingPhone">Telefone / WhatsApp</label><input id="onboardingPhone" type="tel" inputmode="tel" autocomplete="tel" required></div>
                </div>
                <p id="profileOnboardingMessage" class="auth-message" role="status"></p>
                <div class="modal-actions"><button type="submit" class="btn btn-primary">Salvar e continuar</button></div>
            </form>
        </dialog>`;
    }

    function injectUi() {
        const authForm = byId('authForm');
        if (authForm && !byId('registerAcademyFields')) {
            authForm.insertAdjacentHTML('afterbegin', registerFieldsMarkup());
        }
        if (!byId('profileOnboardingModal')) {
            document.body.insertAdjacentHTML('beforeend', onboardingMarkup());
        }
    }

    function isRegisterMode() {
        try {
            return typeof authMode !== 'undefined' && authMode === 'register';
        } catch {
            return false;
        }
    }

    function syncRegisterUi() {
        const registerFields = byId('registerAcademyFields');
        const emailField = byId('emailField');
        const passwordField = byId('passwordField');
        const confirmPasswordField = byId('confirmPasswordField');
        if (!registerFields) return;
        const registering = isRegisterMode();
        registerFields.hidden = !registering;
        if (emailField) emailField.hidden = registering || (typeof authMode !== 'undefined' && authMode === 'update-password');
        if (passwordField) passwordField.hidden = registering || (typeof authMode !== 'undefined' && authMode === 'reset');
        if (confirmPasswordField && registering) confirmPasswordField.hidden = true;
        registerFields.querySelectorAll('input').forEach(input => { input.required = registering; });
    }

    async function handleRegisterCapture(event) {
        if (!isRegisterMode()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const button = byId('authSubmit');
        try {
            if (typeof setLoading === 'function') setLoading(button, true, 'Criando conta...');
            if (typeof authMessage === 'function') authMessage('');
            const academyName = byId('signupAcademyName').value;
            const responsibleName = byId('signupResponsibleName').value;
            const phone = byId('signupPhone').value;
            const email = byId('signupEmail').value.trim();
            const password = byId('signupPassword').value;
            const passwordConfirm = byId('signupPasswordConfirm').value;
            const normalized = AcademyContext.validateBootstrapPayload({academyName, responsibleName, phone});
            if (!email) throw new Error('Informe seu e-mail.');
            if (password.length < 6) throw new Error('Password should be at least 6 characters');
            if (password !== passwordConfirm) throw new Error('Passwords do not match');
            const {error} = await db.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        academy_name: normalized.academyName,
                        responsible_name: normalized.responsibleName,
                        phone: normalized.phone
                    }
                }
            });
            if (error) throw error;
            if (typeof setAuthMode === 'function') setAuthMode('login');
            syncRegisterUi();
            if (typeof authMessage === 'function') authMessage('Conta criada! Confira seu e-mail para confirmar o acesso.', true);
        } catch (error) {
            const translated = typeof translateError === 'function' ? translateError(error.message) : error.message;
            if (typeof authMessage === 'function') authMessage(translated);
        } finally {
            if (typeof setLoading === 'function') setLoading(button, false, '');
        }
    }

    function openLegacyOnboarding(user) {
        const modal = byId('profileOnboardingModal');
        if (!modal) return;
        const metadata = user?.user_metadata || {};
        byId('onboardingAcademyName').value = metadata.academy_name || '';
        byId('onboardingResponsibleName').value = metadata.responsible_name || '';
        byId('onboardingPhone').value = metadata.phone || '';
        if (!modal.open) modal.showModal();
    }

    async function ensureAcademy(session) {
        if (!session?.user || typeof AcademyContext === 'undefined') return;
        try {
            const membership = await AcademyContext.resolve(session.user);
            if (membership) {
                const modal = byId('profileOnboardingModal');
                if (modal?.open) modal.close();
                return;
            }
            const metadata = session.user.user_metadata || {};
            if (metadata.academy_name && metadata.responsible_name && metadata.phone) {
                await AcademyContext.bootstrap({
                    academyName: metadata.academy_name,
                    responsibleName: metadata.responsible_name,
                    phone: metadata.phone
                });
                return;
            }
            openLegacyOnboarding(session.user);
        } catch (error) {
            console.warn('academy onboarding failed', error.message);
            openLegacyOnboarding(session.user);
            const message = byId('profileOnboardingMessage');
            if (message) message.textContent = 'Não foi possível preparar a academia. Tente novamente.';
        }
    }

    async function submitLegacyOnboarding(event) {
        event.preventDefault();
        const message = byId('profileOnboardingMessage');
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        message.textContent = 'Salvando...';
        try {
            await AcademyContext.bootstrap({
                academyName: byId('onboardingAcademyName').value,
                responsibleName: byId('onboardingResponsibleName').value,
                phone: byId('onboardingPhone').value
            });
            message.textContent = '';
            byId('profileOnboardingModal').close();
            if (typeof loadData === 'function') await loadData();
        } catch (error) {
            message.textContent = error.message || 'Não foi possível concluir o perfil.';
        } finally {
            button.disabled = false;
        }
    }

    injectUi();
    syncRegisterUi();
    byId('authForm')?.addEventListener('submit', handleRegisterCapture, true);
    byId('profileOnboardingForm')?.addEventListener('submit', submitLegacyOnboarding);
    byId('toggleAuthMode')?.addEventListener('click', () => queueMicrotask(syncRegisterUi));
    byId('forgotPassword')?.addEventListener('click', () => queueMicrotask(syncRegisterUi));

    db.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') return;
        if (!session?.user) {
            AcademyContext.clear();
            return;
        }
        setTimeout(() => ensureAcademy(session), 0);
    });
})();
