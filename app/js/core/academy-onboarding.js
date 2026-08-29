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

    const createLegacyBootstrapView = () => {
        const existing = document.getElementById('academyBootstrapView');
        if (existing) {
            return existing;
        }

        if (!document.body) {
            return null;
        }

        const view = document.createElement('section');
        view.id = 'academyBootstrapView';
        view.className = 'academy-bootstrap-view';
        view.hidden = true;
        view.setAttribute('role', 'dialog');
        view.setAttribute('aria-modal', 'true');
        view.setAttribute('aria-labelledby', 'academyBootstrapTitle');

        const card = document.createElement('div');
        card.id = 'academyBootstrapCard';
        card.className = 'academy-bootstrap-card';

        const eyebrow = document.createElement('span');
        eyebrow.className = 'academy-bootstrap-eyebrow';
        eyebrow.textContent = 'Configuração da academia';

        const title = document.createElement('h1');
        title.id = 'academyBootstrapTitle';
        title.textContent = 'Finalize sua conta';

        const copy = document.createElement('p');
        copy.className = 'academy-bootstrap-copy';
        copy.textContent = 'Informe o nome da academia para vincular seus dados atuais com segurança.';

        const form = document.createElement('form');
        form.id = 'academyBootstrapForm';
        form.className = 'academy-bootstrap-form';

        const field = document.createElement('div');
        field.className = 'field';

        const label = document.createElement('label');
        label.setAttribute('for', 'academyBootstrapName');
        label.textContent = 'Nome da academia';

        const input = document.createElement('input');
        input.id = 'academyBootstrapName';
        input.setAttribute('type', 'text');
        input.setAttribute('autocomplete', 'organization');
        input.setAttribute('maxlength', '160');
        input.setAttribute('placeholder', 'Ex.: Arte Nativa');
        input.required = true;

        const button = document.createElement('button');
        button.id = 'academyBootstrapSubmit';
        button.className = 'btn btn-primary academy-bootstrap-submit';
        button.setAttribute('type', 'submit');
        button.setAttribute('aria-busy', 'false');
        button.textContent = 'Continuar';

        const message = document.createElement('p');
        message.id = 'academyBootstrapMessage';
        message.className = 'auth-message academy-bootstrap-message';
        message.setAttribute('role', 'status');
        message.setAttribute('aria-live', 'polite');

        field.appendChild(label);
        field.appendChild(input);
        form.appendChild(field);
        form.appendChild(button);
        form.appendChild(message);
        card.appendChild(eyebrow);
        card.appendChild(title);
        card.appendChild(copy);
        card.appendChild(form);
        view.appendChild(card);
        document.body.appendChild(view);
        return view;
    };

    const field = createAcademyField();
    const input = field?.querySelector('input') || null;
    const authTitle = document.getElementById('authTitle');
    const legacyView = createLegacyBootstrapView();
    const legacyCard = document.getElementById('academyBootstrapCard');
    const legacyForm = document.getElementById('academyBootstrapForm');
    const legacyInput = document.getElementById('academyBootstrapName');
    const legacySubmit = document.getElementById('academyBootstrapSubmit');
    const legacyMessage = document.getElementById('academyBootstrapMessage');
    let pendingLegacyAuth = null;

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

    const setLegacyLoading = loading => {
        if (legacySubmit) {
            legacySubmit.disabled = loading;
            legacySubmit.setAttribute('aria-busy', String(loading));
        }
        if (legacyInput) {
            legacyInput.disabled = loading;
        }
    };

    const hideLegacyView = () => new Promise(resolve => {
        if (!legacyView || legacyView.hidden) {
            resolve();
            return;
        }

        const finish = () => {
            legacyView.hidden = true;
            legacyView.classList.remove('is-visible', 'is-leaving');
            legacyCard?.classList.remove('is-entering', 'is-leaving');
            resolve();
        };

        legacyView.classList.remove('is-visible');
        legacyView.classList.add('is-leaving');
        legacyCard?.classList.remove('is-entering');
        legacyCard?.classList.add('is-leaving');
        setTimeout(finish, 140);
    });

    const showLegacyView = (client, event, session, callback) => {
        if (!legacyView || !legacyInput || !legacyMessage) {
            return false;
        }

        pendingLegacyAuth = { client, event, session, callback };
        legacyInput.value = '';
        legacyMessage.textContent = '';
        setLegacyLoading(false);

        const authView = document.getElementById('authView');
        const appView = document.getElementById('appView');
        if (authView) authView.hidden = true;
        if (appView) appView.hidden = true;

        legacyView.hidden = false;
        legacyView.classList.remove('is-leaving');
        legacyCard?.classList.remove('is-leaving', 'is-entering');

        window.requestAnimationFrame?.(() => {
            legacyView.classList.add('is-visible');
            legacyCard?.classList.add('is-entering');
        });

        legacyInput.focus?.();
        return true;
    };

    if (legacyForm) {
        legacyForm.addEventListener('submit', async event => {
            event.preventDefault();

            if (!pendingLegacyAuth || !legacyInput || !legacyMessage) {
                return;
            }

            const academyName = legacyInput.value.trim();
            if (!academyName) {
                legacyMessage.textContent = 'Informe o nome da academia.';
                legacyInput.focus?.();
                return;
            }

            setLegacyLoading(true);
            legacyMessage.textContent = 'Configurando sua academia...';

            try {
                const academyId = await academyContext.bootstrap(
                    pendingLegacyAuth.client,
                    academyName
                );

                if (!academyId) {
                    throw new Error('Academy bootstrap returned no id');
                }

                window.currentAcademyId = academyId;
                const auth = pendingLegacyAuth;
                pendingLegacyAuth = null;
                await hideLegacyView();
                setLegacyLoading(false);
                legacyMessage.textContent = '';
                await auth.callback(auth.event, auth.session);
            } catch (error) {
                console.error('Não foi possível criar a academia para a conta existente.', error);
                window.currentAcademyId = null;
                legacyMessage.textContent = 'Não foi possível configurar a academia. Tente novamente.';
                setLegacyLoading(false);
            }
        });
    }

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
                    pendingLegacyAuth = null;
                    await hideLegacyView();
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

                        if (!academyId && !academyName) {
                            if (showLegacyView(client, event, session, callback)) {
                                return;
                            }
                        }
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
        getAcademyName: () => input?.value?.trim() || '',
        showLegacyView
    };
})();
