(() => {
    const academyContext = window.AcademyContext;
    const supabase = window.supabase;

    if (!academyContext || !supabase?.createClient || supabase.__academyOnboardingWrapped) {
        return;
    }

    const createAcademyField = () => {
        const existing = document.getElementById('academyNameField');
        if (existing) {
            return existing;
        }

        const emailField = document.getElementById('emailField');
        if (!emailField?.parentNode) {
            return null;
        }

        const field = document.createElement('div');
        field.id = 'academyNameField';
        field.className = 'field academy-name-field';
        field.hidden = true;

        const label = document.createElement('label');
        label.setAttribute('for', 'academyName');
        label.textContent = 'Nome da academia';

        const input = document.createElement('input');
        input.id = 'academyName';
        input.setAttribute('type', 'text');
        input.setAttribute('autocomplete', 'organization');
        input.setAttribute('maxlength', '160');
        input.setAttribute('placeholder', 'Ex.: Arte Nativa');
        input.disabled = true;

        field.appendChild(label);
        field.appendChild(input);
        emailField.parentNode.insertBefore(field, emailField);
        return field;
    };

    const field = createAcademyField();
    const input = field?.querySelector('input') || null;
    const authTitle = document.getElementById('authTitle');

    const isRegisterMode = () => authTitle?.textContent?.trim() === 'Criar conta da academia';

    const syncRegistrationField = () => {
        if (!field || !input) {
            return;
        }

        const register = isRegisterMode();
        field.hidden = !register;
        input.required = register;
        input.disabled = !register;
        field.classList.remove('is-entering');

        if (register) {
            window.requestAnimationFrame?.(() => field.classList.add('is-entering'));
        }
    };

    if (authTitle && window.MutationObserver) {
        new window.MutationObserver(syncRegistrationField).observe(authTitle, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    syncRegistrationField();

    const authSubmit = document.getElementById('authSubmit');
    const syncSubmitBusy = () => {
        if (authSubmit) {
            authSubmit.setAttribute('aria-busy', String(Boolean(authSubmit.disabled)));
        }
    };

    if (authSubmit && window.MutationObserver) {
        new window.MutationObserver(syncSubmitBusy).observe(authSubmit, {
            attributes: true,
            attributeFilter: ['disabled']
        });
    }
    syncSubmitBusy();

    const originalCreateClient = supabase.createClient.bind(supabase);
    supabase.__academyOnboardingWrapped = true;
    supabase.createClient = (...args) => {
        const client = originalCreateClient(...args);
        const originalSignUp = client.auth.signUp.bind(client.auth);
        const originalOnAuthStateChange = client.auth.onAuthStateChange.bind(client.auth);

        client.auth.signUp = credentials => {
            const register = isRegisterMode();
            const academyName = input?.value?.trim() || '';

            if (register && !academyName) {
                return Promise.reject(new Error('Informe o nome da academia.'));
            }

            if (!register) {
                return originalSignUp(credentials);
            }

            return originalSignUp({
                ...credentials,
                options: {
                    ...(credentials.options || {}),
                    data: {
                        ...(credentials.options?.data || {}),
                        academy_name: academyName
                    }
                }
            });
        };

        client.auth.onAuthStateChange = callback => originalOnAuthStateChange(
            async (event, session) => {
                if (!session?.user) {
                    window.currentAcademyId = null;
                    return callback(event, session);
                }

                if (event !== 'PASSWORD_RECOVERY') {
                    try {
                        const resolved = await academyContext.resolve(client, session.user);
                        let academyId = resolved.academyId;
                        const academyName = String(
                            session.user.user_metadata?.academy_name || ''
                        ).trim();

                        if (!academyId && academyName) {
                            academyId = await academyContext.bootstrap(client, academyName);
                        }

                        window.currentAcademyId = academyId || null;
                    } catch (error) {
                        window.currentAcademyId = null;
                        console.error('Não foi possível resolver a academia ativa.', error);
                    }
                }

                return callback(event, session);
            }
        );

        return client;
    };

    window.AcademyOnboarding = {
        syncRegistrationField,
        getAcademyName: () => input?.value?.trim() || ''
    };
})();
