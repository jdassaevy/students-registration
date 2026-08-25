(() => {
    const dashboardMarkup = `
        <section id="dashboardView" class="dashboard-view" hidden>
            <div class="dashboard-hero panel">
                <div>
                    <span class="dashboard-kicker">Visão geral</span>
                    <h2 id="dashboardGreeting">Resumo da sua academia</h2>
                    <p>Acompanhe alunos, turmas, recebimentos e pendências em um só lugar.</p>
                </div>
                <div class="dashboard-date" id="dashboardDate"></div>
            </div>

            <section class="dashboard-stats" aria-label="Resumo da academia">
                <article class="dashboard-stat-card">
                    <span class="dashboard-stat-icon">👥</span>
                    <div><small>Alunos</small><strong id="dashboardStudents">0</strong><p id="dashboardCouples">0 cadastros</p></div>
                </article>
                <article class="dashboard-stat-card">
                    <span class="dashboard-stat-icon">◫</span>
                    <div><small>Turmas ativas</small><strong id="dashboardClasses">0</strong><p>Turmas cadastradas</p></div>
                </article>
                <article class="dashboard-stat-card dashboard-stat-featured">
                    <span class="dashboard-stat-icon">R$</span>
                    <div><small>Total recebido</small><strong id="dashboardReceived">R$ 0,00</strong><p>Inscrições + mensalidades</p></div>
                </article>
                <article class="dashboard-stat-card">
                    <span class="dashboard-stat-icon">!</span>
                    <div><small>Pendências</small><strong id="dashboardPending">0</strong><p>Pagamentos em aberto</p></div>
                </article>
            </section>

            <div class="dashboard-grid">
                <section class="dashboard-section panel">
                    <div class="dashboard-section-head">
                        <div><span class="dashboard-kicker">Financeiro</span><h3>Recebimentos</h3></div>
                        <button type="button" class="dashboard-link" id="dashboardFinancialLink">Ver financeiro →</button>
                    </div>
                    <div class="dashboard-money-grid">
                        <div><span>Inscrições</span><strong id="dashboardEntriesReceived">R$ 0,00</strong></div>
                        <div><span>Mensalidades</span><strong id="dashboardMonthlyReceived">R$ 0,00</strong></div>
                    </div>
                    <div class="dashboard-progress-block">
                        <div class="dashboard-progress-label"><span>Pagamentos concluídos</span><strong id="dashboardPaymentRate">0%</strong></div>
                        <div class="dashboard-progress"><span id="dashboardPaymentBar"></span></div>
                    </div>
                </section>

                <section class="dashboard-section panel">
                    <div class="dashboard-section-head">
                        <div><span class="dashboard-kicker">Atenção</span><h3>Pendências</h3></div>
                    </div>
                    <div class="dashboard-pending-grid">
                        <div><span>Inscrições pendentes</span><strong id="dashboardPendingEntries">0</strong></div>
                        <div><span>Mensalidades pendentes</span><strong id="dashboardPendingMonthly">0</strong></div>
                    </div>
                    <p class="dashboard-helper" id="dashboardPendingHelper">Nenhuma pendência no momento.</p>
                </section>
            </div>

            <section class="dashboard-section panel dashboard-classes-panel">
                <div class="dashboard-section-head">
                    <div><span class="dashboard-kicker">Turmas</span><h3>Resumo por turma</h3></div>
                    <button type="button" class="dashboard-link" id="dashboardStudentsLink">Gerenciar alunos →</button>
                </div>
                <div id="dashboardClassList" class="dashboard-class-list"></div>
            </section>
        </section>`;

    const style = document.createElement('style');
    style.textContent = `
        .dashboard-view{display:grid;gap:18px}.dashboard-view[hidden]{display:none!important}
        .dashboard-hero{padding:24px 26px;display:flex;align-items:center;justify-content:space-between;gap:20px;overflow:visible}
        .dashboard-kicker{display:block;margin-bottom:5px;color:var(--terracotta);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}
        .dashboard-hero h2,.dashboard-section h3{margin:0;color:var(--wine-dark);font-family:Georgia,serif}.dashboard-hero h2{font-size:clamp(25px,3vw,34px)}
        .dashboard-hero p{margin:7px 0 0;color:var(--muted)}.dashboard-date{flex:0 0 auto;padding:10px 14px;border-radius:12px;background:rgba(91,33,24,.07);color:var(--wine);font-size:12px;font-weight:800;text-transform:capitalize}
        .dashboard-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.dashboard-stat-card{min-width:0;padding:19px;display:flex;gap:14px;align-items:center;border:1px solid rgba(255,255,255,.76);border-radius:20px;background:var(--surface-glass,rgba(255,253,248,.92));box-shadow:var(--shadow);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
        .dashboard-stat-icon{width:44px;height:44px;flex:0 0 44px;display:grid;place-items:center;border-radius:13px;background:#f2e7dc;color:var(--wine);font-size:17px;font-weight:900}.dashboard-stat-card small{display:block;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.dashboard-stat-card strong{display:block;margin-top:4px;color:var(--wine-dark);font-size:25px;line-height:1.15}.dashboard-stat-card p{margin:3px 0 0;color:var(--muted);font-size:11px}
        .dashboard-stat-featured{background:linear-gradient(135deg,var(--wine-dark),var(--wine));border-color:transparent}.dashboard-stat-featured small,.dashboard-stat-featured strong,.dashboard-stat-featured p{color:white}.dashboard-stat-featured p{opacity:.7}.dashboard-stat-featured .dashboard-stat-icon{background:rgba(255,255,255,.12);color:white}
        .dashboard-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}.dashboard-section{padding:22px 24px;overflow:visible}.dashboard-section-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:19px}.dashboard-section h3{font-size:22px}.dashboard-link{border:0;background:transparent;color:var(--wine);font-size:12px;font-weight:850;padding:7px 0}
        .dashboard-money-grid,.dashboard-pending-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dashboard-money-grid>div,.dashboard-pending-grid>div{padding:15px;border:1px solid var(--line);border-radius:14px;background:rgba(250,247,242,.72)}.dashboard-money-grid span,.dashboard-pending-grid span{display:block;color:var(--muted);font-size:11px;font-weight:750}.dashboard-money-grid strong,.dashboard-pending-grid strong{display:block;margin-top:5px;color:var(--wine-dark);font-size:20px}
        .dashboard-progress-block{margin-top:18px}.dashboard-progress-label{display:flex;justify-content:space-between;gap:15px;margin-bottom:8px;color:var(--muted);font-size:12px}.dashboard-progress-label strong{color:var(--wine)}.dashboard-progress{height:9px;overflow:hidden;border-radius:999px;background:#eadfd4}.dashboard-progress span{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--terracotta),var(--wine));transition:width .4s var(--motion-ease)}
        .dashboard-helper{margin:14px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.dashboard-class-list{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.dashboard-class-card{padding:15px 16px;border:1px solid var(--line);border-radius:15px;background:rgba(250,247,242,.7)}.dashboard-class-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dashboard-class-card strong{color:var(--wine-dark);font-size:14px}.dashboard-class-card small{display:block;margin-top:3px;color:var(--muted);font-size:11px}.dashboard-class-count{padding:5px 8px;border-radius:999px;background:#f2e7dc;color:var(--wine);font-size:10px;font-weight:850;white-space:nowrap}.dashboard-class-progress{height:6px;margin-top:12px;overflow:hidden;border-radius:999px;background:#eadfd4}.dashboard-class-progress span{display:block;height:100%;border-radius:inherit;background:var(--green)}.dashboard-empty{grid-column:1/-1;padding:24px;text-align:center;color:var(--muted)}
        @media(max-width:900px){.dashboard-stats{grid-template-columns:1fr 1fr}.dashboard-grid{grid-template-columns:1fr}}
        @media(max-width:600px){.dashboard-hero{align-items:flex-start;flex-direction:column}.dashboard-date{align-self:flex-start}.dashboard-stats{grid-template-columns:1fr}.dashboard-class-list{grid-template-columns:1fr}.dashboard-money-grid,.dashboard-pending-grid{grid-template-columns:1fr}.dashboard-section-head{align-items:flex-start;flex-direction:column}.dashboard-stat-card strong{font-size:23px}}
    `;
    document.head.appendChild(style);

    const nav = document.querySelector('.view-tabs');
    const dashboardTab = document.createElement('button');
    dashboardTab.type = 'button';
    dashboardTab.className = 'view-tab';
    dashboardTab.id = 'dashboardTab';
    dashboardTab.textContent = 'Visão Geral';
    nav.prepend(dashboardTab);

    const studentsView = document.getElementById('studentsView');
    studentsView.insertAdjacentHTML('beforebegin', dashboardMarkup);

    const originalSetView = setView;
    setView = function(view) {
        if (view !== 'dashboard') {
            document.getElementById('dashboardView').hidden = true;
            dashboardTab.classList.remove('active');
            return originalSetView(view);
        }

        activeView = 'dashboard';
        document.getElementById('dashboardView').hidden = false;
        document.getElementById('studentsView').hidden = true;
        document.getElementById('financialView').hidden = true;
        dashboardTab.classList.add('active');
        document.getElementById('studentsTab').classList.remove('active');
        document.getElementById('financialTab').classList.remove('active');
        renderDashboard();
        animateView(document.getElementById('dashboardView'));
    };

    function paymentTotals() {
        return couples.reduce((acc, c) => {
            const people = [
                {exists: true, entry: c.entryPayments.person1, months: c.payments.person1, fees: c.fees.person1},
                {exists: Boolean(c.person2), entry: c.entryPayments.person2, months: c.payments.person2, fees: c.fees.person2}
            ];
            people.forEach(person => {
                if (!person.exists) return;
                acc.people += 1;
                acc.possible += 4;
                if (person.entry) {
                    acc.paid += 1;
                    acc.entriesReceived += person.fees.entry;
                } else {
                    acc.pendingEntries += 1;
                }
                const paidMonths = person.months.filter(Boolean).length;
                acc.paid += paidMonths;
                acc.pendingMonthly += 3 - paidMonths;
                acc.monthlyReceived += paidMonths * person.fees.monthly;
            });
            return acc;
        }, {people:0, possible:0, paid:0, pendingEntries:0, pendingMonthly:0, entriesReceived:0, monthlyReceived:0});
    }

    function classPaymentRate(classId) {
        const items = couples.filter(c => c.classId === classId);
        let possible = 0, paid = 0;
        items.forEach(c => {
            possible += c.person2 ? 8 : 4;
            paid += Number(c.entryPayments.person1) + c.payments.person1.filter(Boolean).length;
            if (c.person2) paid += Number(c.entryPayments.person2) + c.payments.person2.filter(Boolean).length;
        });
        return possible ? Math.round((paid / possible) * 100) : 0;
    }

    function renderDashboard() {
        const totals = paymentTotals();
        const received = totals.entriesReceived + totals.monthlyReceived;
        const pending = totals.pendingEntries + totals.pendingMonthly;
        const rate = totals.possible ? Math.round((totals.paid / totals.possible) * 100) : 0;

        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
        document.getElementById('dashboardGreeting').textContent = `${greeting}! Aqui está o resumo da sua academia.`;
        document.getElementById('dashboardDate').textContent = new Intl.DateTimeFormat('pt-BR', {weekday:'long', day:'2-digit', month:'long'}).format(new Date());
        document.getElementById('dashboardStudents').textContent = totals.people;
        document.getElementById('dashboardCouples').textContent = `${couples.length} ${couples.length === 1 ? 'cadastro' : 'cadastros'}`;
        document.getElementById('dashboardClasses').textContent = classes.length;
        document.getElementById('dashboardReceived').textContent = money(received);
        document.getElementById('dashboardPending').textContent = pending;
        document.getElementById('dashboardEntriesReceived').textContent = money(totals.entriesReceived);
        document.getElementById('dashboardMonthlyReceived').textContent = money(totals.monthlyReceived);
        document.getElementById('dashboardPendingEntries').textContent = totals.pendingEntries;
        document.getElementById('dashboardPendingMonthly').textContent = totals.pendingMonthly;
        document.getElementById('dashboardPaymentRate').textContent = `${rate}%`;
        document.getElementById('dashboardPaymentBar').style.width = `${rate}%`;
        document.getElementById('dashboardPendingHelper').textContent = pending
            ? `${pending} pagamento${pending === 1 ? '' : 's'} ainda precisa${pending === 1 ? '' : 'm'} de atenção.`
            : 'Tudo em dia por aqui. Nenhuma pendência no momento.';

        const classList = document.getElementById('dashboardClassList');
        classList.innerHTML = classes.length ? classes.map(item => {
            const classCouples = couples.filter(c => c.classId === item.id);
            const people = classCouples.reduce((sum, c) => sum + (c.person2 ? 2 : 1), 0);
            const rate = classPaymentRate(item.id);
            const details = [item.place, item.schedule].filter(Boolean).join(' • ') || 'Sem detalhes cadastrados';
            return `<article class="dashboard-class-card">
                <div class="dashboard-class-card-head"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(details)}</small></div><span class="dashboard-class-count">${people} aluno${people === 1 ? '' : 's'}</span></div>
                <div class="dashboard-class-progress" title="${rate}% dos pagamentos concluídos"><span style="width:${rate}%"></span></div>
            </article>`;
        }).join('') : '<div class="dashboard-empty">Crie sua primeira turma para acompanhar o resumo aqui.</div>';
    }

    const originalRender = render;
    render = function() {
        originalRender();
        renderDashboard();
    };

    dashboardTab.onclick = () => setView('dashboard');
    document.getElementById('dashboardFinancialLink').onclick = () => setView('financial');
    document.getElementById('dashboardStudentsLink').onclick = () => setView('students');

    setView('dashboard');
})();
