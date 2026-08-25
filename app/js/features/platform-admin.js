(() => {
    if (typeof document === 'undefined' || document.getElementById('platformAdminView')) return;

    const nav = document.querySelector('.view-tabs');
    const main = document.querySelector('main.app');
    const appView = document.getElementById('appView');
    if (!nav || !main || !appView) return;

    let isPlatformAdmin = false;
    let currentAdminUserId = null;
    let activeSupportLogId = null;
    let activeSupportAcademyId = null;
    let restoreDbFrom = null;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'view-tab';
    tab.id = 'platformAdminTab';
    tab.hidden = true;
    tab.dataset.iconTab = 'true';
    tab.setAttribute('aria-label', 'Dassaevy Labs');
    tab.innerHTML = '<span class="view-tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 6v6c0 5.5 3.8 9.5 9 10 5.2-.5 9-4.5 9-10V6l-9-4Zm0 4 5 2.2V12c0 3.4-2 5.9-5 6.7-3-.8-5-3.3-5-6.7V8.2L12 6Z"/></svg></span><span class="view-tab-label" aria-hidden="true">Dassaevy Labs</span>';
    nav.appendChild(tab);

    const section = document.createElement('section');
    section.id = 'platformAdminView';
    section.className = 'platform-admin-view';
    section.hidden = true;
    section.innerHTML = `
        <section class="platform-admin-hero panel">
            <div><span class="platform-admin-kicker">Administração da plataforma</span><h2>Painel Dassaevy Labs</h2><p>Gerencie academias e inicie acessos de suporte auditados.</p></div>
            <button type="button" class="btn btn-light" id="refreshPlatformAcademies">Atualizar</button>
        </section>
        <section class="platform-admin-stats">
            <article class="stat"><span>Academias cadastradas</span><strong id="platformAcademyCount">0</strong></article>
            <article class="stat"><span>Assinaturas ativas</span><strong id="platformActiveCount">0</strong></article>
            <article class="stat"><span>Conta Dassaevy Labs</span><strong>Isenta</strong></article>
        </section>
        <section class="panel platform-admin-panel">
            <div class="platform-admin-head"><div><span class="platform-admin-kicker">Clientes</span><h3>Academias</h3></div></div>
            <div id="platformAcademyList" class="platform-academy-list"><div class="empty">Carregando academias...</div></div>
        </section>`;
    main.appendChild(section);

    const banner = document.createElement('div');
    banner.id = 'supportModeBanner';
    banner.className = 'support-mode-banner';
    banner.hidden = true;
    banner.innerHTML = '<div><strong>Modo suporte Dassaevy Labs</strong><span id="supportModeAcademyName"></span></div><button type="button" class="btn btn-light" id="exitSupportMode">Sair do modo suporte</button>';
    const topbar = appView.querySelector('.topbar');
    if (topbar) topbar.insertAdjacentElement('afterend', banner);
    else appView.prepend(banner);

    const style = document.createElement('style');
    style.textContent = `
        .platform-admin-view{display:grid;gap:18px}.platform-admin-view[hidden]{display:none!important}.platform-admin-hero{padding:23px 25px;display:flex;align-items:center;justify-content:space-between;gap:20px}.platform-admin-hero h2,.platform-admin-panel h3{margin:0;color:var(--wine-dark);font-family:Georgia,serif}.platform-admin-hero h2{font-size:clamp(25px,3vw,34px)}.platform-admin-hero p{margin:7px 0 0;color:var(--muted)}.platform-admin-kicker{display:block;margin-bottom:5px;color:var(--terracotta);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}.platform-admin-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.platform-admin-panel{padding:22px 24px}.platform-admin-head{margin-bottom:16px}.platform-admin-panel h3{font-size:21px}.platform-academy-list{display:grid;gap:10px}.platform-academy-card{display:grid;grid-template-columns:1.3fr 1fr auto;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:rgba(250,247,242,.65)}.platform-academy-card strong{display:block;color:var(--wine-dark);font-size:13px}.platform-academy-card span{display:block;margin-top:3px;color:var(--muted);font-size:10px}.platform-subscription{padding:5px 8px;border-radius:999px;background:#e5efe6;color:#477153;font-size:9px;font-weight:850;text-transform:uppercase}.support-mode-banner{position:sticky;top:0;z-index:1200;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:11px 18px;background:#fff2cd;border-bottom:1px solid #e9cf83;box-shadow:0 8px 22px rgba(52,21,15,.1)}.support-mode-banner[hidden]{display:none!important}.support-mode-banner div{display:grid;gap:2px}.support-mode-banner strong{color:#6f521b;font-size:12px}.support-mode-banner span{color:#8a6a2c;font-size:10px}@media(max-width:760px){.platform-admin-stats{grid-template-columns:1fr}.platform-academy-card{grid-template-columns:1fr}.support-mode-banner{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);

    const byId = id => document.getElementById(id);

    function wrapAutomationSettingsBuilder(builder, academyId) {
        if (!builder || (typeof builder !== 'object' && typeof builder !== 'function')) return builder;
        return new Proxy(builder, {
            get(target, property, receiver) {
                if (property === 'then') {
                    const then = Reflect.get(target, property, receiver);
                    return typeof then === 'function' ? then.bind(target) : then;
                }
                const value = Reflect.get(target, property, receiver);
                if (typeof value !== 'function') return value;
                if (property === 'eq') {
                    return (column, expected) => wrapAutomationSettingsBuilder(
                        value.call(target, column === 'user_id' ? 'academy_id' : column, column === 'user_id' ? academyId : expected),
                        academyId
                    );
                }
                if (property === 'insert') {
                    return (payload, options) => {
                        const addAcademy = row => ({...row, academy_id: row?.academy_id || academyId});
                        const nextPayload = Array.isArray(payload) ? payload.map(addAcademy) : addAcademy(payload);
                        return wrapAutomationSettingsBuilder(value.call(target, nextPayload, options), academyId);
                    };
                }
                return (...args) => wrapAutomationSettingsBuilder(value.apply(target, args), academyId);
            }
        });
    }

    function installSupportDbCompatibility(academyId) {
        if (restoreDbFrom) return;
        const originalFrom = db.from.bind(db);
        db.from = table => {
            const builder = originalFrom(table);
            return table === 'automation_settings' ? wrapAutomationSettingsBuilder(builder, academyId) : builder;
        };
        restoreDbFrom = () => {
            db.from = originalFrom;
            restoreDbFrom = null;
        };
    }

    function uninstallSupportDbCompatibility() {
        if (restoreDbFrom) restoreDbFrom();
    }

    async function loadAcademies() {
        if (!isPlatformAdmin) return;
        const {data, error} = await db.from('academies')
            .select('id,name,contact_email,contact_phone,subscription_status,created_at')
            .order('name', {ascending: true});
        if (error) throw error;
        const academies = data || [];
        byId('platformAcademyCount').textContent = academies.length;
        byId('platformActiveCount').textContent = academies.filter(item => item.subscription_status === 'active').length;
        byId('platformAcademyList').innerHTML = academies.length ? academies.map(item => `
            <article class="platform-academy-card">
                <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.contact_email || 'Sem e-mail')}</span></div>
                <div><span>${escapeHtml(item.contact_phone || 'Sem contato')}</span><span class="platform-subscription">${escapeHtml(item.subscription_status || 'active')}</span></div>
                <button type="button" class="btn btn-primary" data-support-academy="${item.id}" data-support-name="${escapeHtml(item.name)}">Acessar academia</button>
            </article>`).join('') : '<div class="empty"><b>Nenhuma academia cadastrada</b>As novas contas aparecerão aqui.</div>';
    }

    async function closeOtherOpenLogs() {
        if (!currentAdminUserId) return;
        const now = new Date().toISOString();
        await db.from('support_access_logs')
            .update({ended_at: now})
            .eq('admin_user_id', currentAdminUserId)
            .is('ended_at', null);
    }

    async function enter(academyId, academyName = 'Academia', reason = 'Suporte Dassaevy Labs') {
        if (!isPlatformAdmin || !currentAdminUserId) throw new Error('Acesso administrativo indisponível.');
        await closeOtherOpenLogs();
        const {data, error} = await db.from('support_access_logs').insert({
            admin_user_id: currentAdminUserId,
            academy_id: academyId,
            reason,
            metadata: {source: 'platform_console'}
        }).select('id,academy_id').single();
        if (error) throw error;
        activeSupportLogId = data.id;
        activeSupportAcademyId = data.academy_id;
        AcademyContext.useSupportAcademy(activeSupportAcademyId);
        installSupportDbCompatibility(activeSupportAcademyId);
        byId('supportModeAcademyName').textContent = `Você está acessando: ${academyName}`;
        banner.hidden = false;
        if (typeof loadData === 'function') await loadData();
        if (typeof setView === 'function') setView(document.getElementById('dashboardView') ? 'dashboard' : 'students');
        return data;
    }

    async function exit() {
        if (activeSupportLogId) {
            const {error} = await db.from('support_access_logs')
                .update({ended_at: new Date().toISOString()})
                .eq('id', activeSupportLogId);
            if (error) throw error;
        }
        activeSupportLogId = null;
        activeSupportAcademyId = null;
        uninstallSupportDbCompatibility();
        AcademyContext.clear();
        banner.hidden = true;
        if (typeof setView === 'function') setView('platformAdmin');
        await loadAcademies();
    }

    function getActiveAcademyId() {
        return activeSupportAcademyId;
    }

    window.SupportContext = {enter, exit, getActiveAcademyId};

    async function checkPlatformAdmin(user) {
        currentAdminUserId = user?.id || null;
        isPlatformAdmin = false;
        tab.hidden = true;
        if (!user?.id) return false;
        const {data, error} = await db.from('profiles')
            .select('platform_role,subscription_exempt')
            .eq('user_id', user.id)
            .maybeSingle();
        if (error) throw error;
        isPlatformAdmin = data?.platform_role === 'platform_admin';
        tab.hidden = !isPlatformAdmin;
        if (isPlatformAdmin) {
            await loadAcademies();
            if (!activeSupportAcademyId && typeof setView === 'function') setView('platformAdmin');
        }
        return isPlatformAdmin;
    }

    const originalSetView = typeof setView === 'function' ? setView : null;
    if (originalSetView) {
        setView = function (view) {
            if (view !== 'platformAdmin') {
                section.hidden = true;
                tab.classList.remove('active');
                return originalSetView(view);
            }
            if (!isPlatformAdmin || activeSupportAcademyId) return;
            activeView = 'platformAdmin';
            document.querySelectorAll('main.app > [id$="View"]').forEach(viewElement => {
                if (viewElement.id !== 'platformAdminView') viewElement.hidden = true;
            });
            section.hidden = false;
            document.querySelectorAll('.view-tab').forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            loadAcademies().catch(error => console.warn('platform academies load failed', error.message));
            if (typeof animateView === 'function') animateView(section);
        };
    }

    tab.addEventListener('click', () => setView('platformAdmin'));
    byId('refreshPlatformAcademies').addEventListener('click', () => loadAcademies().catch(error => toast(error.message)));
    byId('exitSupportMode').addEventListener('click', () => exit().catch(error => toast(error.message || 'Não foi possível sair do modo suporte.')));
    byId('platformAcademyList').addEventListener('click', event => {
        const button = event.target.closest('[data-support-academy]');
        if (!button) return;
        enter(button.dataset.supportAcademy, button.dataset.supportName)
            .catch(error => toast(error.message || 'Não foi possível acessar a academia.'));
    });

    db.auth.onAuthStateChange((event, session) => {
        if (!session?.user) {
            uninstallSupportDbCompatibility();
            activeSupportLogId = null;
            activeSupportAcademyId = null;
            banner.hidden = true;
            tab.hidden = true;
            return;
        }
        setTimeout(() => checkPlatformAdmin(session.user).catch(error => console.warn('platform admin check failed', error.message)), 0);
    });
})();
