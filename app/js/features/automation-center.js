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
    const canRetry = (message, activeStudents) => Boolean(activeStudents) && message
        ?.status === 'failed' && RETRYABLE_TYPES.has(
            message?.automation_type
        ) && activeStudents.has(message?.student_id);
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
    section.innerHTML = `
        <section class="automation-hero panel">
            <div>
                <span class="automation-kicker">Etapa 5</span>
                <h2>Central de Automações</h2>
                <p>Controle lembretes, confirmações e recibos sem alterar as regras financeiras da academia.</p>
            </div>
            <div class="automation-integration" id="automationIntegrationStatus">
                <span class="automation-dot waiting"></span>
                <div><small>WhatsApp Business</small><strong>Verificando conexão</strong><span>Carregando histórico de envios</span></div>
            </div>
        </section>

        <section class="automation-stats" aria-label="Resumo das automações">
            <article class="automation-stat"><small>Enviadas</small><strong id="automationSent">0</strong><span>aceitas pela API</span></article>
            <article class="automation-stat"><small>Entregues</small><strong id="automationDelivered">0</strong><span>chegaram ao WhatsApp</span></article>
            <article class="automation-stat"><small>Lidas</small><strong id="automationRead">0</strong><span>confirmadas pelo aluno</span></article>
            <article class="automation-stat"><small>Falhas</small><strong id="automationFailed">0</strong><span>precisam de atenção</span></article>
            <article class="automation-stat"><small>Não enviadas</small><strong id="automationSkipped">0</strong><span>sem elegibilidade</span></article>
        </section>

        <div class="automation-grid">
            <section class="automation-card panel">
                <div class="automation-card-head"><div><span class="automation-kicker">Preferências</span><h3>Automações da academia</h3></div><span class="automation-fixed">D-3 • D0 • D+3 fixos</span></div>
                <div class="automation-setting-list" id="automationSettingsList">
                    <label class="automation-setting"><div><strong>Lembretes de mensalidade</strong><span>Antes, no dia e após o vencimento.</span></div><input type="checkbox" data-automation-setting="reminders_enabled"></label>
                    <label class="automation-setting"><div><strong>Confirmação de pagamento</strong><span>Mensagem automática após marcar como pago.</span></div><input type="checkbox" data-automation-setting="payment_confirmation_enabled"></label>
                    <label class="automation-setting"><div><strong>Enviar recibo em PDF</strong><span>O PDF continua sendo gerado mesmo se desligado.</span></div><input type="checkbox" data-automation-setting="receipt_delivery_enabled"></label>
                    <label class="automation-setting"><div><strong>Aviso de estorno</strong><span>Notifica quando um pagamento é desmarcado.</span></div><input type="checkbox" data-automation-setting="void_notification_enabled"></label>
                </div>
                <p class="automation-helper" id="automationSettingsMessage"></p>
            </section>

            <section class="automation-card panel">
                <div class="automation-card-head"><div><span class="automation-kicker">Pré-Meta</span><h3>Checklist de prontidão</h3></div></div>
                <div id="automationReadiness" class="automation-readiness"></div>
            </section>
        </div>

        <section class="automation-card panel">
            <div class="automation-card-head"><div><span class="automation-kicker">Histórico</span><h3>Atividade recente</h3></div><button type="button" class="btn btn-light" id="automationRefresh">Atualizar</button></div>
            <div class="automation-activity" id="automationActivity"><div class="automation-empty">Carregando histórico...</div></div>
        </section>`;
    main.appendChild(section);

    const style = document.createElement('style');
    style.textContent = `
        .automation-view{display:grid;gap:18px}.automation-view[hidden]{display:none!important}
        .automation-hero{padding:23px 25px;display:flex;align-items:center;justify-content:space-between;gap:20px}.automation-hero h2,.automation-card h3{margin:0;color:var(--wine-dark);font-family:Georgia,serif}.automation-hero h2{font-size:clamp(25px,3vw,34px)}.automation-hero p{margin:7px 0 0;color:var(--muted)}
        .automation-kicker{display:block;margin-bottom:5px;color:var(--terracotta);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}.automation-integration{display:flex;align-items:center;gap:11px;min-width:220px;padding:13px 15px;border:1px solid var(--line);border-radius:15px;background:rgba(250,247,242,.72)}.automation-integration div{display:grid;gap:2px}.automation-integration small,.automation-integration span{color:var(--muted);font-size:10px}.automation-integration strong{color:var(--wine-dark);font-size:13px}.automation-dot{width:11px;height:11px;border-radius:50%;background:#c99856;box-shadow:0 0 0 4px rgba(201,152,86,.15)}.automation-dot.connected{background:#477153;box-shadow:0 0 0 4px rgba(71,113,83,.15)}.automation-dot.problem{background:#a13d32;box-shadow:0 0 0 4px rgba(161,61,50,.15)}
        .automation-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.automation-stat{padding:17px;border:1px solid rgba(255,255,255,.76);border-radius:18px;background:var(--surface-glass,rgba(255,253,248,.92));box-shadow:var(--shadow)}.automation-stat small{display:block;color:var(--muted);font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.automation-stat strong{display:block;margin-top:5px;color:var(--wine-dark);font-size:23px}.automation-stat span{display:block;margin-top:3px;color:var(--muted);font-size:10px}
        .automation-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}.automation-card{padding:21px 23px}.automation-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;margin-bottom:15px}.automation-card h3{font-size:20px}.automation-fixed{padding:6px 9px;border-radius:999px;background:#f2e7dc;color:var(--wine);font-size:9px;font-weight:850;white-space:nowrap}.automation-setting-list{display:grid;gap:9px}.automation-setting{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:13px 14px;border:1px solid var(--line);border-radius:13px;background:rgba(250,247,242,.6);cursor:pointer}.automation-setting div{display:grid;gap:3px}.automation-setting strong{color:var(--wine-dark);font-size:12px}.automation-setting span{color:var(--muted);font-size:10px}.automation-setting input{width:18px;height:18px;accent-color:var(--wine)}.automation-helper{min-height:16px;margin:10px 1px 0;color:var(--muted);font-size:10px}
        .automation-readiness{display:grid;gap:8px}.automation-check{display:flex;align-items:flex-start;gap:9px;padding:9px 10px;border-radius:11px;background:rgba(250,247,242,.58)}.automation-check b{display:grid;place-items:center;width:19px;height:19px;flex:0 0 19px;border-radius:50%;font-size:10px}.automation-check.ok b{background:#e3efe5;color:#3f6948}.automation-check.pending b{background:#f4e8d6;color:#946c37}.automation-check div{display:grid;gap:2px}.automation-check strong{color:var(--wine-dark);font-size:11px}.automation-check span{color:var(--muted);font-size:9px;line-height:1.35}
        .automation-activity{display:grid;gap:8px}.automation-row{display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(160px,1.25fr) 110px 130px auto;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(250,247,242,.55)}.automation-row strong{color:var(--wine-dark);font-size:11px}.automation-row span{color:var(--muted);font-size:10px}.automation-row .automation-status{font-weight:800}.automation-row .automation-status.failed{color:#a13d32}.automation-row .automation-status.read,.automation-row .automation-status.delivered{color:#477153}.automation-error{grid-column:1/-1;padding-top:7px;border-top:1px dashed var(--line);color:#9a4a40!important}.automation-retry{padding:7px 9px;border:1px solid var(--line);border-radius:9px;background:white;color:var(--wine);font-size:9px;font-weight:800;cursor:pointer}.automation-retry:disabled{opacity:.55;cursor:wait}.automation-empty{padding:25px;text-align:center;color:var(--muted);font-size:11px}
        @media(max-width:1000px){.automation-stats{grid-template-columns:repeat(3,1fr)}.automation-grid{grid-template-columns:1fr}}@media(max-width:700px){.automation-hero{align-items:flex-start;flex-direction:column}.automation-integration{width:100%}.automation-stats{grid-template-columns:1fr 1fr}.automation-row{grid-template-columns:1fr auto}.automation-row span:nth-child(2),.automation-row span:nth-child(4){display:none}}
    `;
    document.head.appendChild(style);

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
        }
    }

    async function loadMessages() {
        const [{data: messages, error: messageError}, {data: students, error: studentError}] = await Promise.all([
            db.from('automation_messages').select('id,student_id,person,automation_type,status,error_code,error_message,provider_message_id,created_at,executed_at,receipt_id').order('created_at', {ascending: false}).limit(50),
            db.from('students').select('id,person1,person2').is('archived_at', null)
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
            const retry = canRetry(message, studentsById)
                ? `<button type="button" class="automation-retry" data-retry-message="${message.id}">Reenviar</button>`
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
            db.from('students').select('id,person1_phone,person2_phone').is('archived_at', null).limit(500),
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
        try {
            await ensureSettings();
            renderSettings();
            await loadMessages();
            await loadReadiness();
        } catch (error) {
            console.warn('automation center load failed', error.message);
            document.getElementById('automationActivity').innerHTML = '<div class="automation-empty">Não foi possível carregar os dados de automação agora.</div>';
        }
    }

    async function retryMessage(button) {
        const sourceMessageId = button.dataset.retryMessage;
        if (!sourceMessageId || button.disabled) return;
        button.disabled = true;
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