(() => {
    const REPORT_MONTHS = 6;
    let reportEvents = [];
    let revenueChart = null;
    let statusChart = null;
    let classChart = null;

    const reportsMarkup = `
        <section id="reportsView" class="reports-view" hidden>
            <header class="reports-head">
                <div class="reports-head-copy">
                    <span class="reports-kicker">Relatórios</span>
                    <h2>Desempenho da academia</h2>
                    <p>Acompanhe receita, pagamentos e desempenho financeiro por turma.</p>
                </div>
                <label class="reports-filter-control">
                    <span>Visualizar</span>
                    <select id="reportsClassFilter" class="class-filter" aria-label="Filtrar relatórios por turma">
                        <option value="all">Todas as turmas</option>
                        <option value="none">Sem turma</option>
                    </select>
                </label>
            </header>

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
                <section class="report-card report-wide">
                    <div class="report-card-head">
                        <div>
                            <span class="reports-kicker">Receita</span>
                            <h3>Receita mensal</h3>
                        </div>
                        <span class="report-note">Últimos ${REPORT_MONTHS} meses</span>
                    </div>
                    <div class="chart-wrap">
                        <div class="reports-chart-skeleton reports-chart-skeleton--line" aria-hidden="true"></div>
                        <canvas id="revenueChart"></canvas>
                    </div>
                    <p class="report-helper" id="revenueHistoryNotice" aria-live="polite"></p>
                </section>

                <section class="report-card">
                    <div class="report-card-head">
                        <div>
                            <span class="reports-kicker">Situação</span>
                            <h3>Pagamentos</h3>
                        </div>
                    </div>
                    <div class="chart-wrap chart-small">
                        <div class="reports-chart-skeleton reports-chart-skeleton--donut" aria-hidden="true"></div>
                        <canvas id="statusChart"></canvas>
                    </div>
                </section>
            </div>

            <section class="report-card report-card--performance">
                <div class="report-card-head">
                    <div>
                        <span class="reports-kicker">Turmas</span>
                        <h3>Desempenho por turma</h3>
                    </div>
                    <span class="report-note">Percentual de pagamentos concluídos</span>
                </div>
                <div class="chart-wrap class-chart-wrap">
                    <div class="reports-chart-skeleton reports-chart-skeleton--bars" aria-hidden="true"></div>
                    <canvas id="classChart"></canvas>
                </div>
                <div id="reportClassTable" class="report-class-table"></div>
            </section>
        </section>`;

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

    function setReportsChartLoading(loading) {
        const view = document.getElementById('reportsView');
        if (!view)
            return;
        view.classList.toggle('is-chart-loading', Boolean(loading));
        view.setAttribute('aria-busy', String(Boolean(loading)));
    }

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
        });
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
        reportEvents = data || [];
        return true;
    }

    function destroyCharts() {
        [revenueChart, statusChart, classChart].forEach(
            chart => chart?.destroy()
        );
        revenueChart = statusChart = classChart = null;
    }

    async function renderCharts(items, metrics, rows) {
        setReportsChartLoading(true);
        try {
            await loadChartJs();
            destroyCharts();

            const css = getComputedStyle(document.documentElement);
            const accent = css
                .getPropertyValue('--accent-primary')
                .trim() || '#A35E47';
            const success = css
                .getPropertyValue('--status-success')
                .trim() || '#6f9d7f';
            const warning = css
                .getPropertyValue('--status-warning')
                .trim() || '#c4a16f';
            const muted = css
                .getPropertyValue('--text-muted')
                .trim() || '#9C9A9A';
            const grid = css
                .getPropertyValue('--border-default')
                .trim() || 'rgba(245,245,220,.10)';
            const series = revenueSeries();

            revenueChart = new Chart(document.getElementById('revenueChart'), {
                type: 'line',
                data: {
                    labels: series.map(x => x.label),
                    datasets: [
                        {
                            label: 'Receita',
                            data: series.map(x => x.total),
                            borderColor: accent,
                            backgroundColor: accent,
                            fill: false,
                            tension: .35,
                            borderWidth: 2,
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
                                success, warning
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
                            backgroundColor: accent,
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
        } catch (error) {
            document
                .getElementById('revenueHistoryNotice')
                .textContent = 'Não foi possível carregar a biblioteca de gráficos.';
            console.warn('Não foi possível renderizar os gráficos:', error?.message || error);
        } finally {
            setReportsChartLoading(false);
        }
    }

    async function renderReports() {
        setReportsChartLoading(true);
        try {
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
                            ? 'O gráfico usa a data real registrada quando cada pagamento é marcado como recebido.'
                            : 'O histórico começa a ser preenchido a partir dos próximos pagamentos marcados como recebidos.'
                    )
                    : 'Execute a atualização do banco da Etapa 4 para ativar o histórico mensal de receita.';

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
                    <span>${money(row.received)} recebidos • ${money(row.pending)} pendentes</span>
                    <b class="rate">${row.rate}%</b>
                </div>`
                        )
                        .join('')
                    : '<div class="report-empty">Nenhuma turma ou aluno encontrado neste filtro.</div>';

            await renderCharts(items, metrics, rows);
        } finally {
            setReportsChartLoading(false);
        }
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
        } catch (error) {
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
