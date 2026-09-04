(() => {
    const REPORT_MONTHS = 6;
    let reportEvents = [];
    let revenueChart = null;
    let statusChart = null;
    let classChart = null;

    const reportsMarkup = `
        <section id="reportsView" class="reports-view" hidden>
            <div class="reports-head panel">
                <div>
                    <span class="reports-kicker">Etapa 4</span>
                    <h2>Gráficos e relatórios</h2>
                    <p>Acompanhe receita, inadimplência e desempenho financeiro das turmas.</p>
                </div>
                <select id="reportsClassFilter" class="class-filter" aria-label="Filtrar relatórios por turma">
                    <option value="all">Todas as turmas</option>
                    <option value="none">Sem turma</option>
                </select>
            </div>

            <section class="reports-stats" aria-label="Indicadores dos relatórios">
                <article class="report-stat featured">
                    <small>Total recebido</small>
                    <strong id="reportReceived">R$ 0,00</strong>
                    <span>Pagamentos atualmente marcados como recebidos</span>
                </article>
                <article class="report-stat">
                    <small>Valor pendente</small>
                    <strong id="reportPendingValue">R$ 0,00</strong>
                    <span id="reportPendingCount">0 pagamentos em aberto</span>
                </article>
                <article class="report-stat">
                    <small>Taxa de adimplência</small>
                    <strong id="reportPaymentRate">0%</strong>
                    <span>Pagamentos concluídos sobre o total previsto</span>
                </article>
                <article class="report-stat">
                    <small>Alunos</small>
                    <strong id="reportStudents">0</strong>
                    <span id="reportClasses">0 turmas no filtro</span>
                </article>
            </section>

            <div class="reports-grid">
                <section class="report-card panel report-wide">
                    <div class="report-card-head">
                        <div><span class="reports-kicker">Receita</span><h3>Receita mensal</h3></div>
                        <span class="report-note">Últimos ${REPORT_MONTHS} meses</span>
                    </div>
                    <div class="chart-wrap"><canvas id="revenueChart"></canvas></div>
                    <p class="report-helper" id="revenueHistoryNotice"></p>
                </section>

                <section class="report-card panel">
                    <div class="report-card-head">
                        <div><span class="reports-kicker">Situação</span><h3>Pagamentos</h3></div>
                    </div>
                    <div class="chart-wrap chart-small"><canvas id="statusChart"></canvas></div>
                </section>
            </div>

            <section class="report-card panel">
                <div class="report-card-head">
                    <div><span class="reports-kicker">Turmas</span><h3>Desempenho por turma</h3></div>
                    <span class="report-note">Percentual de pagamentos concluídos</span>
                </div>
                <div class="chart-wrap class-chart-wrap"><canvas id="classChart"></canvas></div>
                <div id="reportClassTable" class="report-class-table"></div>
            </section>
        </section>`;

    const style = document.createElement('style');
    style.textContent = `
        .reports-view{display:grid;gap:18px}.reports-view[hidden]{display:none!important}
        .reports-head{padding:23px 25px;display:flex;justify-content:space-between;align-items:center;gap:20px;overflow:visible}
        .reports-head h2,.report-card h3{margin:0;color:var(--wine-dark);font-family:Georgia,serif}.reports-head h2{font-size:clamp(25px,3vw,34px)}.reports-head p{margin:7px 0 0;color:var(--muted)}
        .reports-kicker{display:block;margin-bottom:5px;color:var(--terracotta);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}
        .reports-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.report-stat{padding:19px;border:1px solid rgba(255,255,255,.76);border-radius:20px;background:var(--surface-glass,rgba(255,253,248,.92));box-shadow:var(--shadow);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
        .report-stat small{display:block;color:var(--muted);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.report-stat strong{display:block;margin-top:7px;color:var(--wine-dark);font-size:24px}.report-stat span{display:block;margin-top:5px;color:var(--muted);font-size:11px;line-height:1.4}.report-stat.featured{background:linear-gradient(135deg,var(--wine-dark),var(--wine));border-color:transparent}.report-stat.featured small,.report-stat.featured strong,.report-stat.featured span{color:white}.report-stat.featured span{opacity:.72}
        .reports-grid{display:grid;grid-template-columns:1.55fr .75fr;gap:18px}.report-card{padding:22px 24px;overflow:visible}.report-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;margin-bottom:16px}.report-card h3{font-size:21px}.report-note{padding:6px 9px;border-radius:999px;background:#f2e7dc;color:var(--wine);font-size:10px;font-weight:800;white-space:nowrap}.chart-wrap{position:relative;height:290px}.chart-small{height:290px}.class-chart-wrap{height:280px}.report-helper{margin:10px 0 0;color:var(--muted);font-size:11px;line-height:1.45}
        .report-class-table{display:grid;gap:8px;margin-top:18px}.report-class-row{display:grid;grid-template-columns:minmax(160px,1fr) auto auto auto;gap:14px;align-items:center;padding:11px 13px;border:1px solid var(--line);border-radius:13px;background:rgba(250,247,242,.72)}.report-class-row strong{color:var(--wine-dark);font-size:12px}.report-class-row span{color:var(--muted);font-size:11px}.report-class-row b{color:var(--wine);font-size:12px}.report-class-row .rate{min-width:48px;text-align:right}.report-empty{padding:22px;text-align:center;color:var(--muted)}
        @media(max-width:950px){.reports-stats{grid-template-columns:1fr 1fr}.reports-grid{grid-template-columns:1fr}}
        @media(max-width:620px){.reports-head{align-items:flex-start;flex-direction:column}.reports-head .class-filter{width:100%}.reports-stats{grid-template-columns:1fr}.report-card-head{flex-direction:column}.chart-wrap,.chart-small,.class-chart-wrap{height:245px}.report-class-row{grid-template-columns:1fr auto}.report-class-row span:nth-of-type(2){display:none}}
    `;
    document
        .head
        .appendChild(style);

    const nav = document.querySelector('.view-tabs');
    const reportsTab = document.createElement('button');
    reportsTab.type = 'button';
    reportsTab.className = 'view-tab';
    reportsTab.id = 'reportsTab';
    reportsTab.textContent = 'Relatórios';
    nav.appendChild(reportsTab);

    document
        .querySelector('main.app')
        .insertAdjacentHTML('beforeend', reportsMarkup);

    function loadChartJs() {
        if (window.Chart) 
            return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document
                .head
                .appendChild(script);
        });
    }

    function normalizeFilterOptions() {
        const select = document.getElementById('reportsClassFilter');
        const previous = select.value;
        select.innerHTML = `<option value="all">Todas as turmas</option><option value="none">Sem turma</option>${classes
            .map(
                item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`
            )
            .join('')}`;
        if ([...select.options].some(option => option.value === previous)) 
            select.value = previous;
        }
    
    function filteredCouples() {
        const filter = document
            .getElementById('reportsClassFilter')
            .value;
        return couples.filter(c => filter === 'all' || (
            filter === 'none'
                ? !c.classId
                : c.classId === filter
        ));
    }

    function reportMetrics(items) {
        return items.reduce((acc, c) => {
            const people = [
                {
                    exists: true,
                    person: 'person1'
                }, {
                    exists: Boolean(c.person2),
                    person: 'person2'
                }
            ];
            people.forEach(({exists, person}) => {
                if (!exists) 
                    return;
                acc.students += 1;
                const fees = c.fees[person];
                const entryPaid = c.entryPayments[person];
                acc.possible += 4;
                acc.expected += fees.entry + (fees.monthly * 3);
                if (entryPaid) {
                    acc.paid += 1;
                    acc.received += fees.entry;
                } else {
                    acc.pendingCount += 1;
                    acc.pendingValue += fees.entry;
                }
                c
                    .payments[person]
                    .forEach(on => {
                        if (on) {
                            acc.paid += 1;
                            acc.received += fees.monthly;
                        } else {
                            acc.pendingCount += 1;
                            acc.pendingValue += fees.monthly;
                        }
                    });
            });
            return acc;
        }, {
            students: 0,
            possible: 0,
            paid: 0,
            received: 0,
            expected: 0,
            pendingCount: 0,
            pendingValue: 0
        });
    }

    function classRows(items) {
        const groups = new Map();
        items.forEach(c => {
            const key = c.classId || 'none';
            if (!groups.has(key)) 
                groups.set(key, []);
            groups
                .get(key)
                .push(c);
        });
        return [...groups.entries()]
            .map(([id, classItems]) => {
                const metrics = reportMetrics(classItems);
                const item = classes.find(x => x.id === id);
                return {
                    id,
                    name: item
                        ? item.name
                        : 'Sem turma',
                    students: metrics.students,
                    received: metrics.received,
                    pending: metrics.pendingValue,
                    rate: metrics.possible
                        ? Math.round((metrics.paid / metrics.possible) * 100)
                        : 0
                };
            })
            .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name, 'pt-BR'));
    }

    function monthBuckets() {
        const now = new Date();
        const buckets = [];
        for (let i = REPORT_MONTHS - 1; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
                2,
                '0'
            )}`;
            buckets.push({
                key,
                label: new Intl
                    .DateTimeFormat('pt-BR', {month: 'short'})
                    .format(date)
                    .replace('.', ''),
                total: 0
            });
        }
        return buckets;
    }

    function revenueSeries() {
        const buckets = monthBuckets();
        const filter = document
            .getElementById('reportsClassFilter')
            .value;
        reportEvents.forEach(event => {
            if (filter !== 'all' && (
                filter === 'none'
                    ? Boolean(event.class_id)
                    : event.class_id !== filter
            )) 
                return;
            const date = new Date(event.paid_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
                2,
                '0'
            )}`;
            const bucket = buckets.find(x => x.key === key);
            if (bucket) 
                bucket.total += Number(event.amount) || 0;
            }
        );
        return buckets;
    }

    async function loadEvents() {
        const {data, error} = await db
            .from('payment_events')
            .select('*')
            .order('paid_at', {ascending: true});
        if (error) {
            console.warn('Histórico financeiro ainda não configurado:', error.message);
            reportEvents = [];
            return false;
        }
        const activeStudentIds = new Set(couples.map(c => c.id));
        reportEvents = (data || []).filter(event => activeStudentIds.has(event.student_id));
        return true;
    }

    function destroyCharts() {
        [revenueChart, statusChart, classChart].forEach(
            chart => chart
                ?.destroy()
        );
        revenueChart = statusChart = classChart = null;
    }

    async function renderCharts(items, metrics, rows) {
        try {
            await loadChartJs();
        } catch  {
            document
                .getElementById('revenueHistoryNotice')
                .textContent = 'Não foi possível carregar a biblioteca de gráficos.';
            return;
        }
        destroyCharts();
        const css = getComputedStyle(document.documentElement);
        const wine = css
            .getPropertyValue('--wine')
            .trim() || '#5b2118';
        const terracotta = css
            .getPropertyValue('--terracotta')
            .trim() || '#b95f3c';
        const green = css
            .getPropertyValue('--green')
            .trim() || '#56805f';
        const muted = css
            .getPropertyValue('--muted')
            .trim() || '#7d6e67';
        const grid = 'rgba(100,70,60,.10)';
        const series = revenueSeries();

        revenueChart = new Chart(document.getElementById('revenueChart'), {
            type: 'line',
            data: {
                labels: series.map(x => x.label),
                datasets: [
                    {
                        label: 'Receita',
                        data: series.map(x => x.total),
                        borderColor: wine,
                        backgroundColor: 'rgba(91,33,24,.10)',
                        fill: true,
                        tension: .35,
                        pointRadius: 4,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => money(ctx.parsed.y)
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: muted
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: grid
                        },
                        ticks: {
                            color: muted,
                            callback: value => Number(value).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                                maximumFractionDigits: 0
                            })
                        }
                    }
                }
            }
        });

        statusChart = new Chart(document.getElementById('statusChart'), {
            type: 'doughnut',
            data: {
                labels: [
                    'Recebidos', 'Pendentes'
                ],
                datasets: [
                    {
                        data: [
                            metrics.paid, metrics.pendingCount
                        ],
                        backgroundColor: [
                            green, terracotta
                        ],
                        borderWidth: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 8,
                            color: muted,
                            padding: 16
                        }
                    }
                }
            }
        });

        classChart = new Chart(document.getElementById('classChart'), {
            type: 'bar',
            data: {
                labels: rows.map(x => x.name),
                datasets: [
                    {
                        label: 'Adimplência',
                        data: rows.map(x => x.rate),
                        backgroundColor: wine,
                        borderRadius: 7,
                        maxBarThickness: 42
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: rows.length > 5
                    ? 'y'
                    : 'x',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.parsed[
                                rows.length > 5
                                    ? 'x'
                                    : 'y'
                            ]}%`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: rows.length > 5
                            ? 100
                            : undefined,
                        grid: {
                            color: grid
                        },
                        ticks: {
                            color: muted,
                            callback: rows.length > 5
                                ? value => `${value}%`
                                : undefined
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: rows.length > 5
                            ? undefined
                            : 100,
                        grid: {
                            color: rows.length > 5
                                ? 'transparent'
                                : grid
                        },
                        ticks: {
                            color: muted,
                            callback: rows.length > 5
                                ? undefined
                                : value => `${value}%`
                        }
                    }
                }
            }
        });
    }

    async function renderReports() {
        normalizeFilterOptions();
        const items = filteredCouples();
        const metrics = reportMetrics(items);
        const rows = classRows(items);
        const rate = metrics.possible
            ? Math.round((metrics.paid / metrics.possible) * 100)
            : 0;
        const classCount = new Set(items.map(c => c.classId || 'none')).size;

        document
            .getElementById('reportReceived')
            .textContent = money(metrics.received);
        document
            .getElementById('reportPendingValue')
            .textContent = money(metrics.pendingValue);
        document
            .getElementById('reportPendingCount')
            .textContent = `${metrics
            .pendingCount} pagamento${metrics
            .pendingCount === 1
                ? ''
                : 's'} em aberto`;
        document
            .getElementById('reportPaymentRate')
            .textContent = `${rate}%`;
        document
            .getElementById('reportStudents')
            .textContent = metrics.students;
        document
            .getElementById('reportClasses')
            .textContent = `${classCount} ${classCount === 1
                ? 'turma no filtro'
                : 'turmas no filtro'}`;

        const historyReady = await loadEvents();
        document
            .getElementById('revenueHistoryNotice')
            .textContent = historyReady
                ? (
                    reportEvents.length
                        ? 'O gráfico usa a data real registrada quando cada pagamento é marcado como rece' +
                                'bido.'
                        : 'O histórico começa a ser preenchido a partir dos próximos pagamentos marcados ' +
                                'como recebidos.'
                )
                : 'Execute a atualização do banco da Etapa 4 para ativar o histórico mensal de re' +
                        'ceita.';

        document
            .getElementById('reportClassTable')
            .innerHTML = rows.length
                ? rows
                    .map(
                        row => `
            <div class="report-class-row">
                <strong>${escapeHtml(row.name)}</strong>
                <span>${row.students} aluno${row.students === 1
                            ? ''
                            : 's'}</span>
                <span>${money(row.received)} recebidos • ${money(
                                row.pending
                            )} pendentes</span>
                <b class="rate">${row.rate}%</b>
            </div>`
                    )
                    .join('')
                : '<div class="report-empty">Nenhuma turma ou aluno encontrado neste filtro.</div' +
                        '>';

        await renderCharts(items, metrics, rows);
    }

    async function syncPaymentEvent({
        student,
        person,
        kind,
        installment = 0,
        paid
    }) {
        try {
            if (!student) 
                return;
            const amount = kind === 'entry'
                ? student
                    .fees[person]
                    .entry
                : student
                    .fees[person]
                    .monthly;
            const match = db
                .from('payment_events')
                .delete()
                .eq('student_id', student.id)
                .eq('person', person)
                .eq('kind', kind)
                .eq('installment', installment);
            if (!paid) {
                await match;
            } else {
                await match;
                const {error} = await db
                    .from('payment_events')
                    .insert({
                        student_id: student.id,
                        class_id: student.classId || null,
                        person,
                        kind,
                        installment,
                        amount,
                        paid_at: new Date().toISOString()
                    });
                if (error) 
                    throw error;
                }
            if (activeView === 'reports') 
                await renderReports();
            }
        catch (error) {
            console.warn('Não foi possível registrar a data do pagamento:', error.message);
        }
    }

    const originalToggleEntry = toggleEntry;
    toggleEntry = async function (id, person) {
        const student = couples.find(x => x.id === id);
        const before = Boolean(
            student
                ?.entryPayments
                    ?.[person]
        );
        await originalToggleEntry(id, person);
        const after = Boolean(
            student
                ?.entryPayments
                    ?.[person]
        );
        if (before !== after) 
            await syncPaymentEvent({student, person, kind: 'entry', paid: after});
        };
    
    const originalToggleMonth = toggleMonth;
    toggleMonth = async function (id, person, index) {
        const student = couples.find(x => x.id === id);
        const before = Boolean(
            student
                ?.payments
                    ?.[person]
                        ?.[index]
        );
        await originalToggleMonth(id, person, index);
        const after = Boolean(
            student
                ?.payments
                    ?.[person]
                        ?.[index]
        );
        if (before !== after) 
            await syncPaymentEvent({
                student,
                person,
                kind: 'monthly',
                installment: index + 1,
                paid: after
            });
        };
    
    const originalSetView = setView;
    setView = function (view) {
        if (view !== 'reports') {
            document
                .getElementById('reportsView')
                .hidden = true;
            reportsTab
                .classList
                .remove('active');
            return originalSetView(view);
        }
        activeView = 'reports';
        document
            .getElementById('reportsView')
            .hidden = false;
        document
            .getElementById('dashboardView')
            .hidden = true;
        document
            .getElementById('studentsView')
            .hidden = true;
        document
            .getElementById('financialView')
            .hidden = true;
        document
            .querySelectorAll('.view-tab')
            .forEach(tab => tab.classList.remove('active'));
        reportsTab
            .classList
            .add('active');
        renderReports();
        animateView(document.getElementById('reportsView'));
    };

    const originalRender = render;
    render = function () {
        originalRender();
        normalizeFilterOptions();
        if (activeView === 'reports') 
            renderReports();
        };
    
    reportsTab.onclick = () => setView('reports');
    document
        .getElementById('reportsClassFilter')
        .onchange = renderReports;
})();
