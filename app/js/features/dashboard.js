(() => {
    const dashboardMarkup = `
        <section id="dashboardView" class="dashboard-view" hidden aria-busy="true">
            <div id="dashboardSkeleton" class="dashboard-skeleton" aria-hidden="true">
                <div class="dashboard-skeleton-headline">
                    <div class="dashboard-skeleton-copy">
                        <span class="ui-skeleton ui-skeleton-line"></span>
                        <span class="ui-skeleton ui-skeleton-line"></span>
                        <span class="ui-skeleton ui-skeleton-line"></span>
                    </div>
                    <span class="ui-skeleton dashboard-skeleton-date"></span>
                </div>
                <div class="dashboard-skeleton-command">
                    <span class="ui-skeleton dashboard-skeleton-revenue"></span>
                    <div class="dashboard-skeleton-kpis">
                        <div class="dashboard-skeleton-kpi-row">
                            <span class="ui-skeleton dashboard-skeleton-kpi"></span>
                            <span class="ui-skeleton dashboard-skeleton-kpi"></span>
                        </div>
                        <span class="ui-skeleton dashboard-skeleton-pending"></span>
                    </div>
                </div>
                <span class="ui-skeleton dashboard-skeleton-classes"></span>
            </div>
            <div id="dashboardContent" class="dashboard-content" hidden>
                <header class="dashboard-headline">
                    <div>
                        <span class="dashboard-kicker">Visão geral</span>
                        <h2 id="dashboardGreeting">Resumo da sua academia</h2>
                        <p>Acompanhe alunos, turmas, recebimentos e pendências em um só lugar.</p>
                    </div>
                    <div class="dashboard-date" id="dashboardDate"></div>
                </header>

                <section class="dashboard-command-grid" aria-label="Resumo da academia">
                    <article class="dashboard-revenue-card dashboard-section">
                        <div class="dashboard-section-head">
                            <div>
                                <span class="dashboard-kicker">Financeiro</span>
                                <h3>Recebimentos</h3>
                            </div>
                            <button type="button" class="dashboard-link" id="dashboardFinancialLink">Ver financeiro →</button>
                        </div>
                        <div class="dashboard-revenue-total">
                            <span>Total recebido</span>
                            <strong id="dashboardReceived">R$ 0,00</strong>
                            <p>Inscrições + mensalidades</p>
                        </div>
                        <div class="dashboard-money-grid">
                            <div><span>Inscrições</span><strong id="dashboardEntriesReceived">R$ 0,00</strong></div>
                            <div><span>Mensalidades</span><strong id="dashboardMonthlyReceived">R$ 0,00</strong></div>
                        </div>
                        <div class="dashboard-progress-block">
                            <div class="dashboard-progress-label"><span>Pagamentos concluídos</span><strong id="dashboardPaymentRate">0%</strong></div>
                            <div class="dashboard-progress"><span id="dashboardPaymentBar"></span></div>
                        </div>
                    </article>

                    <div class="dashboard-kpi-stack">
                        <div class="dashboard-kpi-grid">
                            <article class="dashboard-stat-card">
                                <span class="dashboard-stat-icon dashboard-stat-icon--students" aria-hidden="true"></span>
                                <div><small>Alunos</small><strong id="dashboardStudents">0</strong><p id="dashboardCouples">0 cadastros</p></div>
                            </article>
                            <article class="dashboard-stat-card">
                                <span class="dashboard-stat-icon dashboard-stat-icon--classes" aria-hidden="true"></span>
                                <div><small>Turmas ativas</small><strong id="dashboardClasses">0</strong><p>Turmas cadastradas</p></div>
                            </article>
                        </div>

                        <article class="dashboard-pending-card dashboard-section">
                            <div class="dashboard-pending-summary">
                                <div><span class="dashboard-kicker">Atenção</span><h3>Pendências</h3></div>
                                <strong id="dashboardPending">0</strong>
                            </div>
                            <div class="dashboard-pending-grid">
                                <div><span>Inscrições</span><strong id="dashboardPendingEntries">0</strong></div>
                                <div><span>Mensalidades</span><strong id="dashboardPendingMonthly">0</strong></div>
                            </div>
                            <p class="dashboard-helper" id="dashboardPendingHelper">Nenhuma pendência no momento.</p>
                        </article>
                    </div>
                </section>

                <section class="dashboard-section dashboard-classes-panel">
                    <div class="dashboard-section-head">
                        <div><span class="dashboard-kicker">Turmas</span><h3>Desempenho por turma</h3></div>
                        <button type="button" class="dashboard-link" id="dashboardStudentsLink">Gerenciar alunos →</button>
                    </div>
                    <div id="dashboardClassList" class="dashboard-class-list"></div>
                </section>
            </div>
        </section>`;

    const nav = document.querySelector('.view-tabs');
    const dashboardTab = document.createElement('button');
    dashboardTab.type = 'button';
    dashboardTab.className = 'view-tab';
    dashboardTab.id = 'dashboardTab';
    dashboardTab.textContent = 'Visão Geral';
    nav.prepend(dashboardTab);

    const studentsView = document.getElementById('studentsView');
    studentsView.insertAdjacentHTML('beforebegin', dashboardMarkup);

    let dashboardReady = false;

    function setDashboardLoading(loading) {
        const dashboardView = document.getElementById('dashboardView');
        const skeleton = document.getElementById('dashboardSkeleton');
        const content = document.getElementById('dashboardContent');
        const active = Boolean(loading);
        dashboardView.setAttribute('aria-busy', String(active));
        skeleton.hidden = !active;
        content.hidden = active;
    }

    const originalSetView = setView;
    setView = function (view) {
        if (view !== 'dashboard') {
            document
                .getElementById('dashboardView')
                .hidden = true;
            dashboardTab
                .classList
                .remove('active');
            return originalSetView(view)
        }
        activeView = 'dashboard';
        document
            .getElementById('dashboardView')
            .hidden = false;
        document
            .getElementById('studentsView')
            .hidden = true;
        document
            .getElementById('financialView')
            .hidden = true;
        dashboardTab
            .classList
            .add('active');
        document
            .getElementById('studentsTab')
            .classList
            .remove('active');
        document
            .getElementById('financialTab')
            .classList
            .remove('active');
        if (dashboardReady) {
            renderDashboard();
        } else {
            setDashboardLoading(true);
        }
        animateView(document.getElementById('dashboardView'))
    };

    function paymentTotals() {
        return couples.reduce((acc, c) => {
            const people = [
                {
                    exists: true,
                    entry: c.entryPayments.person1,
                    months: c.payments.person1,
                    fees: c.fees.person1
                }, {
                    exists: Boolean(c.person2),
                    entry: c.entryPayments.person2,
                    months: c.payments.person2,
                    fees: c.fees.person2
                }
            ];
            people.forEach(person => {
                if (!person.exists)
                    return;
                acc.people += 1;
                acc.possible += 4;
                if (person.entry) {
                    acc.paid += 1;
                    acc.entriesReceived += person.fees.entry
                } else
                    acc.pendingEntries += 1;
                const paidMonths = person
                    .months
                    .filter(Boolean)
                    .length;
                acc.paid += paidMonths;
                acc.pendingMonthly += 3 - paidMonths;
                acc.monthlyReceived += paidMonths * person.fees.monthly
            });
            return acc
        }, {
            people: 0,
            possible: 0,
            paid: 0,
            pendingEntries: 0,
            pendingMonthly: 0,
            entriesReceived: 0,
            monthlyReceived: 0
        })
    }

    function classPaymentRate(classId) {
        const items = couples.filter(c => c.classId === classId);
        let possible = 0,
            paid = 0;
        items.forEach(c => {
            possible += c.person2
                ? 8
                : 4;
            paid += Number(c.entryPayments.person1) + c
                .payments
                .person1
                .filter(Boolean)
                .length;
            if (c.person2)
                paid += Number(c.entryPayments.person2) + c
                    .payments
                    .person2
                    .filter(Boolean)
                    .length
            });
        return possible
            ? Math.round((paid / possible) * 100)
            : 0
    }

    function renderDashboard() {
        const totals = paymentTotals(),
            received = totals.entriesReceived + totals.monthlyReceived,
            pending = totals.pendingEntries + totals.pendingMonthly,
            rate = totals.possible
                ? Math.round((totals.paid / totals.possible) * 100)
                : 0,
            hour = new Date().getHours(),
            greeting = hour < 12
                ? 'Bom dia'
                : hour < 18
                    ? 'Boa tarde'
                    : 'Boa noite';
        document
            .getElementById('dashboardGreeting')
            .textContent = `${greeting}! Aqui está o resumo da sua academia.`;
        document
            .getElementById('dashboardDate')
            .textContent = new Intl
            .DateTimeFormat('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long'
            })
            .format(new Date());
        document
            .getElementById('dashboardStudents')
            .textContent = totals.people;
        document
            .getElementById('dashboardCouples')
            .textContent = `${couples
            .length} ${couples
            .length === 1
                ? 'cadastro'
                : 'cadastros'}`;
        document
            .getElementById('dashboardClasses')
            .textContent = classes.length;
        document
            .getElementById('dashboardReceived')
            .textContent = money(received);
        document
            .getElementById('dashboardPending')
            .textContent = pending;
        document
            .getElementById('dashboardEntriesReceived')
            .textContent = money(totals.entriesReceived);
        document
            .getElementById('dashboardMonthlyReceived')
            .textContent = money(totals.monthlyReceived);
        document
            .getElementById('dashboardPendingEntries')
            .textContent = totals.pendingEntries;
        document
            .getElementById('dashboardPendingMonthly')
            .textContent = totals.pendingMonthly;
        document
            .getElementById('dashboardPaymentRate')
            .textContent = `${rate}%`;
        document
            .getElementById('dashboardPaymentBar')
            .style
            .width = `${rate}%`;
        document
            .getElementById('dashboardPendingHelper')
            .textContent = pending
                ? `${pending} pagamento${pending === 1
                    ? ''
                    : 's'} ainda precisa${pending === 1
                        ? ''
                        : 'm'} de atenção.`
                : 'Tudo em dia por aqui. Nenhuma pendência no momento.';
        const classList = document.getElementById('dashboardClassList');
        classList.innerHTML = classes.length
            ? classes
                .map(item => {
                    const classCouples = couples.filter(c => c.classId === item.id),
                        people = classCouples.reduce((sum, c) => sum + (
                            c.person2
                                ? 2
                                : 1
                        ), 0),
                        rate = classPaymentRate(item.id),
                        details = [item.place, item.schedule]
                            .filter(Boolean)
                            .join(' • ') || 'Sem detalhes cadastrados';
                    return `<article class="dashboard-class-card"><div class="dashboard-class-card-head"><div><strong>${escapeHtml(
                        item.name
                    )}</strong><small>${escapeHtml(details)}</small></div><span class="dashboard-class-count">${people} aluno${people === 1
                        ? ''
                        : 's'}</span></div><div class="dashboard-class-progress" title="${rate}% dos pagamentos concluídos"><span style="width:${rate}%"></span></div></article>`
                })
                .join('')
            : '<div class="dashboard-empty">Crie sua primeira turma para acompanhar o resumo ' +
                    'aqui.</div>';
        dashboardReady = true;
        setDashboardLoading(false)
    }

    const originalRender = render;
    render = function () {
        originalRender();
        renderDashboard()
    };

    dashboardTab.onclick = () => setView('dashboard');
    document
        .getElementById('dashboardFinancialLink')
        .onclick = () => setView('financial');
    document
        .getElementById('dashboardStudentsLink')
        .onclick = () => setView('students');
    setView('dashboard');
})();