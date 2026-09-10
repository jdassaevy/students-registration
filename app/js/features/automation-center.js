(() => {
    const STATUS_LABELS = {
        pending: 'Aguardando envio',
        sent: 'Enviado',
        delivered: 'Entregue',
        read: 'Lido',
        failed: 'Falhou',
        skipped: 'Não enviado'
    };

    const TYPE_LABELS = {
        reminder_before_due: 'Lembrete antes do vencimento',
        due_today: 'Lembrete de vencimento',
        overdue: 'Lembrete de atraso',
        payment_confirmation: 'Confirmação de pagamento',
        receipt_document: 'Recibo em PDF',
        payment_voided: 'Aviso de estorno'
    };

    const RETRYABLE_TYPES = new Set(
        ['payment_confirmation', 'receipt_document', 'payment_voided']
    );
    const META_SUCCESS_STATUSES = new Set(['sent', 'delivered', 'read']);
    const DEFAULT_SETTINGS = {
        reminders_enabled: true,
        payment_confirmation_enabled: true,
        receipt_delivery_enabled: true,
        void_notification_enabled: true
    };

    const safeText = value => typeof escapeHtml === 'function'
        ? escapeHtml(value)
        : String(value ?? '').replace(
            /[&<>'"]/g,
            c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c])
        );

    const friendlyStatus = status => STATUS_LABELS[status] || 'Desconhecido';
    const friendlyType = type => TYPE_LABELS[type] || 'Automação';
    const canRetry = message => message
        ?.status === 'failed' && RETRYABLE_TYPES.has(
            message?.automation_type
        );
    const metaConnectionState = messages => {
        const items = Array.isArray(messages) ? messages : [];
        const hasAcceptedMessage = items.some(
            message => META_SUCCESS_STATUSES.has(message?.status) && Boolean(message?.provider_message_id)
        );
        if (hasAcceptedMessage) {
            return {
                key: 'connected',
                ok: true,
                title: 'Meta conectada',
                detail: 'Há envio aceito pela API da Meta.'
            };
        }
        const hasMetaFailure = items.some(
            message => message?.status === 'failed' && Boolean(message?.error_code || message?.error_message)
        );
        if (hasMetaFailure) {
            return {
                key: 'problem',
                ok: false,
                title: 'Meta com problema',
                detail: 'A Meta respondeu com erro. Verifique a integração antes de novos envios.'
            };
        }
        return {
            key: 'unvalidated',
            ok: false,
            title: 'Conexão ainda não validada',
            detail: 'Faça um envio para validar a integração com a Meta.'
        };
    };

    window.AutomationCenterTest = {
        friendlyStatus,
        friendlyType,
        canRetry,
        metaConnectionState
    };

    const nav = document.querySelector('.view-tabs');
    const main = document.querySelector('main.app');
    if (!nav || !main || document.getElementById('automationView')) return;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'view-tab';
    tab.id = 'automationTab';
    tab.textContent = 'Automações';
    nav.appendChild(tab);

    const section = document.createElement('section');
    section.id = 'automationView';
    section.className = 'automation-view';
    section.hidden = true;
    section.setAttribute('aria-busy', 'false');
    section.innerHTML = `
        <div id="automationSkeleton" class="automation-skeleton" hidden aria-hidden="true">
            <div class="automation-skeleton-head">
                <div class="automation-skeleton-copy">
                    <span class="ui-skeleton automation-skeleton-line automation-skeleton-line--short"></span>
                    <span class="ui-skeleton automation-skeleton-line automation-skeleton-line--title"></span>
                    <span class="ui-skeleton automation-skeleton-line"></span>
                </div>
                <span class="ui-skeleton automation-skeleton-integration"></span>
            </div>
            <div class="automation-skeleton-stats" aria-hidden="true">
                ${Array.from({length: 5}, () => '<span class="ui-skeleton automation-skeleton-stat"></span>').join('')}
            </div>
            <div class="automation-skeleton-grid">
                <div class="automation-skeleton-card">
                    <span class="ui-skeleton automation-skeleton-line automation-skeleton-line--title"></span>
                    ${Array.from({length: 4}, () => '<span class="ui-skeleton automation-skeleton-setting"></span>').join('')}
                </div>
                <div class="automation-skeleton-card">
                    <span class="ui-skeleton automation-skeleton-line automation-skeleton-line--title"></span>
                    ${Array.from({length: 5}, () => '<span class="ui-skeleton automation-skeleton-check"></span>').join('')}
                </div>
            </div>
            <div class="automation-skeleton-activity">
                <span class="ui-skeleton automation-skeleton-line automation-skeleton-line--title"></span>
                ${Array.from({length: 4}, () => '<span class="ui-skeleton automation-skeleton-row"></span>').join('')}
            </div>
        </div>

        <div id="automationContent" class="automation-content">
            <header class="automation-page-head">
                <div class="automation-head-copy">
                    <span class="automation-kicker">Automações</span>
                    <h2>Central de Automações</h2>
                    <p>Controle lembretes, confirmações e recibos sem alterar as regras financeiras da academia.</p>
                </div>
                <div class="automation-integration" id="automationIntegrationStatus">
                    <span class="automation-dot waiting"></span>
                    <div><small>WhatsApp Business</small><strong>Verificando conexão</strong><span>Carregando histórico de envios</span></div>
                </div>
            </header>

            <section class="automation-stats" aria-label="Resumo das automações">
                <article class="automation-stat automation-stat--sent"><small>Enviadas</small><strong id="automationSent">0</strong><span>aceitas pela API</span></article>
                <article class="automation-stat automation-stat--delivered"><small>Entregues</small><strong id="automationDelivered">0</strong><span>chegaram ao WhatsApp</span></article>
                <article class="automation-stat automation-stat--read"><small>Lidas</small><strong id="automationRead">0</strong><span>confirmadas pelo aluno</span></article>
                <article class="automation-stat automation-stat--failed"><small>Falhas</small><strong id="automationFailed">0</strong><span>precisam de atenção</span></article>
                <article class="automation-stat automation-stat--skipped"><small>Não enviadas</small><strong id="automationSkipped">0</strong><span>sem elegibilidade</span></article>
            </section>

            <div class="automation-grid">
                <section class="automation-card automation-card--settings panel">
                    <div class="automation-card-head"><div><span class="automation-kicker">Preferências</span><h3>Automações da academia</h3></div><span class="automation-fixed">D-3 • D0 • D+3 fixos</span></div>
                    <div class="automation-setting-list" id="automationSettingsList">
                        <label class="automation-setting"><div><strong>Lembretes de mensalidade</strong><span>Antes, no dia e após o vencimento.</span></div><input type="checkbox" data-automation-setting="reminders_enabled"></label>
                        <label class="automation-setting"><div><strong>Confirmação de pagamento</strong><span>Mensagem automática após marcar como pago.</span></div><input type="checkbox" data-automation-setting="payment_confirmation_enabled"></label>
                        <label class="automation-setting"><div><strong>Enviar recibo em PDF</strong><span>O PDF continua sendo gerado mesmo se desligado.</span></div><input type="checkbox" data-automation-setting="receipt_delivery_enabled"></label>
                        <label class="automation-setting"><div><strong>Aviso de estorno</strong><span>Notifica quando um pagamento é desmarcado.</span></div><input type="checkbox" data-automation-setting="void_notification_enabled"></label>
                    </div>
                    <p class="automation-helper" id="automationSettingsMessage" role="status"></p>
                </section>

                <section class="automation-card automation-card--readiness panel">
                    <div class="automation-card-head"><div><span class="automation-kicker">Prontidão</span><h3>Checklist de integração</h3></div></div>
                    <div id="automationReadiness" class="automation-readiness"></div>
                </section>
            </div>

            <section class="automation-card automation-card--activity panel">
                <div class="automation-card-head"><div><span class="automation-kicker">Histórico</span><h3>Atividade recente</h3></div><button type="button" class="btn btn-light" id="automationRefresh" aria-busy="false">Atualizar</button></div>
                <div class="automation-activity" id="automationActivity" aria-live="polite"><div class="automation-empty">Carregando histórico...</div></div>
            </section>
        </div>`;
    main.appendChild(section);

    const automationSkeleton = document.getElementById('automationSkeleton');
    const automationContent = document.getElementById('automationContent');
    let automationReady = false;

    function setAutomationLoading(loading) {
        section.setAttribute('aria-busy', String(loading));
        const firstLoad = loading && !automationReady;
        if (automationSkeleton) {
            automationSkeleton.hidden = !firstLoad;
            automationSkeleton.setAttribute('aria-hidden', String(!firstLoad));
        }
        if (automationContent) automationContent.hidden = firstLoad;

        const refreshButton = document.getElementById('automationRefresh');
        if (refreshButton) {
            refreshButton.disabled = loading;
            refreshButton.setAttribute('aria-busy', String(loading));
            refreshButton.textContent = loading ? 'Atualizando...' : 'Atualizar';
        }
    }

    let currentSettings = {...DEFAULT_SETTINGS};
    let currentMessages = [];
    let studentsById = new Map();
    let activeUserId = null;

    async function getUserId() {
        if (activeUserId) return activeUserId;
        const {data} = await db.auth.getUser();
        activeUserId = data?.user?.id || null;
        return activeUserId;
    }

    async function ensureSettings() {
        const userId = await getUserId();
        if (!userId) return null;
        const {data, error} = await db.from('automation_settings').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (data) {
            currentSettings = {...DEFAULT_SETTINGS, ...data};
            return data;
        }
        const {data: created, error: createError} = await db.from('automation_settings').insert({user_id: userId, ...DEFAULT_SETTINGS}).select().single();
        if (createError) throw createError;
        currentSettings = {...DEFAULT_SETTINGS, ...created};
        return created;
    }

    function renderSettings() {
        document.querySelectorAll('[data-automation-setting]').forEach(input => {
            input.checked = Boolean(currentSettings[input.dataset.automationSetting]);
        });
    }

    async function updateSetting(input) {
        const key = input.dataset.automationSetting;
        const previous = currentSettings[key];
        currentSettings[key] = input.checked;
        input.disabled = true;
        input.setAttribute('aria-busy', 'true');
        const message = document.getElementById('automationSettingsMessage');
        message.textContent = 'Salvando preferência...';
        try {
            const userId = await getUserId();
            const {error} = await db.from('automation_settings').update({[key]: input.checked}).eq('user_id', userId);
            if (error) throw error;
            message.textContent = 'Preferência salva. As regras financeiras não foram alteradas.';
        } catch (error) {
            currentSettings[key] = previous;
            input.checked = previous;
            message.textContent = 'Não foi possível salvar essa preferência.';
            console.warn('automation setting update failed', error.message);
        } finally {
            input.disabled = false;
            input.setAttribute('aria-busy', 'false');
        }
    }

    async function loadMessages() {
        const [{data: messages, error: messageError}, {data: students, error: studentError}] = await Promise.all([
            db.from('automation_messages').select('id,student_id,person,automation_type,status,error_code,error_message,provider_message_id,created_at,executed_at,receipt_id').order('created_at', {ascending: false}).limit(50),
            db.from('students').select('id,person1,person2')
        ]);
        if (messageError) throw messageError;
        if (studentError) throw studentError;
        currentMessages = messages || [];
        studentsById = new Map((students || []).map(item => [item.id, item]));
        renderSummary();
        renderActivity();
        renderIntegrationStatus();
    }

    function renderSummary() {
        const counts = currentMessages.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {});
        document.getElementById('automationSent').textContent = counts.sent || 0;
        document.getElementById('automationDelivered').textContent = counts.delivered || 0;
        document.getElementById('automationRead').textContent = counts.read || 0;
        document.getElementById('automationFailed').textContent = counts.failed || 0;
        document.getElementById('automationSkipped').textContent = counts.skipped || 0;
    }

    function renderIntegrationStatus() {
        const holder = document.getElementById('automationIntegrationStatus');
        if (!holder) return;
        const state = metaConnectionState(currentMessages);
        holder.innerHTML = `
            <span class="automation-dot ${safeText(state.key)}"></span>
            <div><small>WhatsApp Business</small><strong>${safeText(state.title)}</strong><span>${safeText(state.detail)}</span></div>`;
    }

    function studentNameFor(message) {
        const student = studentsById.get(message.student_id);
        if (!student) return 'Aluno removido';
        return message.person === 'person2' ? (student.person2 || 'Segunda pessoa') : (student.person1 || 'Aluno');
    }

    function renderActivity() {
        const holder = document.getElementById('automationActivity');
        if (!currentMessages.length) {
            holder.innerHTML = '<div class="automation-empty">Nenhuma automação registrada ainda. O histórico aparecerá aqui quando os primeiros fluxos forem executados.</div>';
            return;
        }
        holder.innerHTML = currentMessages.map(message => {
            const date = new Date(message.executed_at || message.created_at);
            const dateText = Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
            const retry = canRetry(message)
                ? `<button type="button" class="automation-retry" data-retry-message="${message.id}" aria-busy="false">Reenviar</button>`
                : '<span></span>';
            const error = message.error_message ? `<span class="automation-error">${safeText(message.error_message)}</span>` : '';
            return `<div class="automation-row">
                <strong>${safeText(studentNameFor(message))}</strong>
                <span>${safeText(friendlyType(message.automation_type))}</span>
                <span class="automation-status ${safeText(message.status)}">${safeText(friendlyStatus(message.status))}</span>
                <span>${safeText(dateText)}</span>
                ${retry}${error}
            </div>`;
        }).join('');
    }

    async function loadReadiness() {
        const userId = await getUserId();
        if (!userId) return;
        const [profileResult, studentsResult, receiptsResult, settingsResult, duplicatesResult] = await Promise.all([
            db.from('academy_profiles').select('academy_name,responsible_name,support_phone').eq('user_id', userId).maybeSingle(),
            db.from('students').select('id,person1_phone,person2_phone').limit(500),
            db.from('receipts').select('id,storage_path,status').limit(1),
            db.from('automation_settings').select('user_id').eq('user_id', userId).maybeSingle(),
            db.rpc('find_duplicate_active_receipts').then(result => result).catch(() => ({data: null, error: new Error('rpc unavailable')}))
        ]);
        const profile = profileResult.data || {};
        const students = studentsResult.data || [];
        const hasWithWhatsapp = students.some(s => Boolean(s.person1_phone || s.person2_phone));
        const hasWithoutWhatsapp = students.some(s => !s.person1_phone || !s.person2_phone);
        const duplicateSafe = !duplicatesResult.error && Array.isArray(duplicatesResult.data)
            ? duplicatesResult.data.length === 0
            : true;
        const metaState = metaConnectionState(currentMessages);
        const checks = [
            {ok: Boolean(profile.academy_name), title: 'Nome da academia', detail: 'Usado nas mensagens e recibos.'},
            {ok: Boolean(profile.responsible_name), title: 'Responsável cadastrado', detail: 'Contato humano para dúvidas do aluno.'},
            {ok: Boolean(profile.support_phone), title: 'Telefone de suporte', detail: 'Será incluído nas mensagens.'},
            {ok: hasWithoutWhatsapp || students.length === 0, title: 'Cadastro sem WhatsApp', detail: 'Telefone continua opcional para o aluno.'},
            {ok: hasWithWhatsapp, title: 'Cadastro com WhatsApp', detail: 'Tenha ao menos um aluno com telefone para o teste real.'},
            {ok: !receiptsResult.error, title: 'Fluxo de recibos', detail: 'Histórico de recibos acessível.'},
            {ok: Boolean(settingsResult.data), title: 'Preferências de automação', detail: 'Configurações individuais da academia criadas.'},
            {ok: duplicateSafe, title: 'Recibos sem duplicidade', detail: 'Proteção de recibo ativo permanece válida.'},
            {ok: metaState.ok, title: 'Conexão com a Meta', detail: metaState.detail}
        ];
        document.getElementById('automationReadiness').innerHTML = checks.map(check => `
            <div class="automation-check ${check.ok ? 'ok' : 'pending'}"><b>${check.ok ? '✓' : '!'}</b><div><strong>${safeText(check.title)}</strong><span>${safeText(check.detail)}</span></div></div>`
        ).join('');
    }

    async function refreshAll() {
        setAutomationLoading(true);
        try {
            await ensureSettings();
            renderSettings();
            await loadMessages();
            await loadReadiness();
        } catch (error) {
            console.warn('automation center load failed', error.message);
            document.getElementById('automationActivity').innerHTML = '<div class="automation-empty">Não foi possível carregar os dados de automação agora.</div>';
        } finally {
            automationReady = true;
            setAutomationLoading(false);
        }
    }

    async function retryMessage(button) {
        const sourceMessageId = button.dataset.retryMessage;
        if (!sourceMessageId || button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Enviando...';
        const requestId = button.dataset.retryRequestId || crypto.randomUUID();
        button.dataset.retryRequestId = requestId;
        try {
            const {data, error} = await db.functions.invoke('retry-automation-message', {
                body: {source_message_id: sourceMessageId, request_id: requestId}
            });
            if (error) throw error;
            if (typeof toast === 'function') {
                toast(data?.status === 'duplicate' ? 'Reenvio já processado.' : 'Mensagem reenviada.');
            }
            delete button.dataset.retryRequestId;
            await loadMessages();
        } catch (error) {
            const text = String(error?.message || '');
            if (typeof toast === 'function') {
                toast(text.includes('503') ? 'Conecte a Meta para realizar o reenvio.' : 'Não foi possível reenviar agora.');
            }
            console.warn('automation retry failed', error.message);
        } finally {
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            button.textContent = 'Reenviar';
        }
    }

    document.querySelectorAll('[data-automation-setting]').forEach(input => input.addEventListener('change', () => updateSetting(input)));
    document.getElementById('automationRefresh').addEventListener('click', refreshAll);
    document.getElementById('automationActivity').addEventListener('click', event => {
        const button = event.target.closest?.('[data-retry-message]');
        if (button) retryMessage(button);
    });

    const originalSetView = typeof setView === 'function' ? setView : null;
    if (originalSetView) {
        setView = function (view) {
            if (view !== 'automation') {
                section.hidden = true;
                tab.classList.remove('active');
                return originalSetView(view);
            }
            activeView = 'automation';
            section.hidden = false;
            document.getElementById('dashboardView')?.setAttribute('hidden', '');
            document.getElementById('studentsView')?.setAttribute('hidden', '');
            document.getElementById('financialView')?.setAttribute('hidden', '');
            document.getElementById('reportsView')?.setAttribute('hidden', '');
            document.querySelectorAll('.view-tab').forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            refreshAll();
            if (typeof animateView === 'function') animateView(section);
        };
    }

    tab.addEventListener('click', () => setView('automation'));
    db.auth.onAuthStateChange((event, session) => {
        activeUserId = session?.user?.id || null;
        if (!session?.user) {
            currentMessages = [];
            studentsById.clear();
        } else if (activeView === 'automation') {
            setTimeout(refreshAll, 0);
        }
    });
})();
