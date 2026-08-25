(function (root) {
    function personFinancialSummary(couple, person) {
        const exists = person === 'person1' || Boolean(couple.person2);
        if (!exists) 
            return null;
        const fees = couple.fees
            ?.[person] || {
                entry: 0,
                monthly: 0
            };
        const entryPaid = Boolean(
            couple.entryPayments
                ?.[person]
        );
        const months = Array.isArray(
            couple.payments
                ?.[person]
        )
            ? couple
                .payments[person]
                .slice(0, 3)
                .map(Boolean)
            : [false, false, false];
        const paidMonths = months
            .filter(Boolean)
            .length;
        const received = (
            entryPaid
                ? Number(fees.entry || 0)
                : 0
        ) + (paidMonths * Number(fees.monthly || 0));
        const pending = (
            !entryPaid
                ? Number(fees.entry || 0)
                : 0
        ) + ((3 - paidMonths) * Number(fees.monthly || 0));
        return {
            entryPaid,
            months,
            paidMonths,
            paidCount: Number(entryPaid) + paidMonths,
            received,
            pending
        };
    }

    function groupFinancialItems(couplesList, classesList, filter) {
        const items = couplesList.filter(c => filter === 'all' || (
            filter === 'none'
                ? !c.classId
                : c.classId === filter
        ));
        const groups = new Map();
        items.forEach(c => {
            const key = c.classId || 'none';
            if (!groups.has(key)) 
                groups.set(key, {
                    id: key,
                    items: []
                });
            groups
                .get(key)
                .items
                .push(c);
        });
        return [...groups.values()].map(group => {
            let students = 0,
                entries = 0,
                monthly = 0,
                received = 0;
            group
                .items
                .forEach(c => {
                    ['person1', 'person2'].forEach(person => {
                        const summary = personFinancialSummary(c, person);
                        if (!summary) 
                            return;
                        students += 1;
                        const fees = c.fees
                            ?.[person] || {
                                entry: 0,
                                monthly: 0
                            };
                        entries += summary.entryPaid
                            ? Number(fees.entry || 0)
                            : 0;
                        monthly += summary.paidMonths * Number(fees.monthly || 0);
                        received += summary.received;
                    });
                });
            const classItem = classesList.find(item => item.id === group.id);
            return {
                ...group,
                students,
                entries,
                monthly,
                received,
                name: classItem
                    ? classItem.name
                    : 'Sem turma'
            };
        });
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            personFinancialSummary,
            groupFinancialItems
        };
    }

    if (!root || !root.document) 
        return;
    const document = root.document;
    const escape = value => typeof escapeHtml === 'function'
        ? escapeHtml(value)
        : String(value ?? '').replace(
            /[&<>\"']/g,
            c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'}[c])
        );
    const formatMoney = value => typeof money === 'function'
        ? money(value)
        : Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });

    const style = document.createElement('style');
    style.textContent = `
    .financial-row-clickable{cursor:pointer;transition:background-color var(--motion-fast) ease,transform var(--motion-fast) ease}.financial-row-clickable:hover{background:rgba(166,75,53,.055)}.financial-row-clickable:active{transform:scale(.997)}
    .financial-row-name{display:flex;align-items:center;gap:8px}.financial-row-arrow{margin-left:auto;color:var(--terracotta);font-weight:900}
    #financialDetailModal{width:min(920px,calc(100% - 28px));max-height:88vh;overflow:hidden}
    .financial-detail-body{padding:0 24px 24px;max-height:calc(88vh - 92px);overflow:auto}.financial-detail-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}.financial-detail-summary>div{padding:14px;border:1px solid var(--line);border-radius:14px;background:#faf7f2}.financial-detail-summary span{display:block;color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.financial-detail-summary strong{display:block;margin-top:5px;color:var(--wine-dark);font-size:18px}
    .financial-student-list{display:grid;gap:12px}.financial-student-card{padding:16px;border:1px solid var(--line);border-radius:16px;background:rgba(255,253,248,.86)}.financial-student-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.financial-student-head strong{color:var(--wine-dark);font-size:15px}.financial-student-head small{display:block;margin-top:3px;color:var(--muted)}.financial-student-total{white-space:nowrap;color:var(--green);font-weight:850}
    .financial-person-detail{display:grid;grid-template-columns:minmax(130px,1fr) minmax(120px,.7fr) minmax(210px,1.2fr) auto;gap:12px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}.financial-person-detail:first-of-type{border-top:0}.financial-person-name strong{font-size:13px}.financial-person-name small{display:block;margin-top:3px;color:var(--muted);font-size:10px}.financial-entry-status{font-size:11px;font-weight:800}.financial-entry-status.ok{color:var(--green)}.financial-entry-status.bad{color:var(--red)}.financial-month-statuses{display:flex;gap:6px;flex-wrap:wrap}.financial-month-chip{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:28px;padding:0 8px;border-radius:9px;font-size:10px;font-weight:850}.financial-month-chip.ok{background:#e6f4ec;color:var(--green)}.financial-month-chip.bad{background:#fbeae7;color:var(--red)}.financial-person-received{text-align:right}.financial-person-received small{display:block;color:var(--muted);font-size:9px;text-transform:uppercase}.financial-person-received strong{font-size:13px;color:var(--wine-dark)}
    @media(max-width:720px){.financial-detail-summary{grid-template-columns:1fr}.financial-person-detail{grid-template-columns:1fr 1fr}.financial-month-statuses{grid-column:1/-1}.financial-person-received{text-align:left}.financial-student-head{flex-direction:column}}
  `;
    document
        .head
        .appendChild(style);

    const modal = document.createElement('dialog');
    modal.id = 'financialDetailModal';
    modal.innerHTML = `<div class="modal-head"><div><h2 id="financialDetailTitle">Detalhes financeiros</h2><p id="financialDetailSubtitle">Pagamentos dos alunos da turma.</p></div><button class="close" type="button" id="closeFinancialDetail" aria-label="Fechar">×</button></div><div class="financial-detail-body"><div id="financialDetailContent"></div></div>`;
    document
        .getElementById('appView')
        .appendChild(modal);

    function renderPerson(c, person, name) {
        const summary = personFinancialSummary(c, person);
        if (!summary) 
            return '';
        const fees = c.fees
            ?.[person] || {
                entry: 0,
                monthly: 0
            };
        return `<div class="financial-person-detail">
      <div class="financial-person-name"><strong>${escape(
            name
        )}</strong><small>Mensalidade: ${formatMoney(fees.monthly)}</small></div>
      <div><span class="financial-entry-status ${summary.entryPaid
            ? 'ok'
            : 'bad'}">Inscrição ${summary.entryPaid
                ? 'paga'
                : 'pendente'}</span><small style="display:block;color:var(--muted);margin-top:3px">${formatMoney(
                    fees.entry
                )}</small></div>
      <div class="financial-month-statuses">${summary
                    .months
                    .map(
                        (on, i) => `<span class="financial-month-chip ${on
                            ? 'ok'
                            : 'bad'}">${i + 1}ª ${on
                                ? '✓'
                                : '—'}</span>`
                    )
                    .join('')}</div>
      <div class="financial-person-received"><small>Recebido</small><strong>${formatMoney(
                        summary.received
                    )}</strong></div>
    </div>`;
    }

    function openGroup(groupId) {
        const currentCouples = typeof couples !== 'undefined'
                ? couples
                : [];
            const currentClasses = typeof classes !== 'undefined'
                ? classes
                : [];
            const filterItems = currentCouples.filter(
                c => (c.classId || 'none') === groupId
            );
            const classItem = currentClasses.find(item => item.id === groupId);
            const name = classItem
                ? classItem.name
                : 'Sem turma';
            const groups = groupFinancialItems(filterItems, currentClasses, 'all');
            const group = groups[0];
            if (!group) 
                return;
            document
                .getElementById('financialDetailTitle')
                .textContent = name;
            document
                .getElementById('financialDetailSubtitle')
                .textContent = `${group
                .students} aluno${group
                .students === 1
                    ? ''
                    : 's'} • detalhes de inscrições e mensalidades`;
            const pending = group
                .items
                .reduce((total, c) => total + ['person1', 'person2'].reduce((sum, p) => sum + (
                    personFinancialSummary(c, p)
                        ?.pending || 0
                ), 0), 0);
            document
                .getElementById('financialDetailContent')
                .innerHTML = `<div class="financial-detail-summary"><div><span>Total recebido</span><strong>${formatMoney(
                    group.received
                )}</strong></div><div><span>Inscrições</span><strong>${formatMoney(
                group.entries
            )}</strong></div><div><span>Valor pendente</span><strong>${formatMoney(pending)}</strong></div></div><div class="financial-student-list">${group
                .items
                .map(
                    c => {
                    const total = ['person1', 'person2'].reduce((sum, p) => sum + (
                        personFinancialSummary(c, p)
                            ?.received || 0
                    ), 0);
                    return `<article class="financial-student-card"><div class="financial-student-head"><div><strong>${escape(
                        c.person1
                    )}${c.person2
                        ? ` &amp; ${escape(c.person2)}`
                        : ''}</strong><small>${c.person2
                            ? 'Casal'
                            : 'Aluno individual'}</small></div><span class="financial-student-total">${formatMoney(
                                total
                            )}</span></div>${renderPerson(c, 'person1', c.person1)}${c.person2
                                ? renderPerson(c, 'person2', c.person2)
                                : ''}</article>`;}).join('')}</div>`;
                    if (typeof openDialog === 'function') 
                        openDialog(modal);
                    else 
                        modal.showModal();
                    }
                
                const originalRenderFinancial = typeof renderFinancial === 'function'
                    ? renderFinancial
                    : null;
                renderFinancial = function () {
                    if (typeof originalRenderFinancial === 'function') 
                        originalRenderFinancial();
                    const select = document.getElementById('financialClassFilter');
                    const list = document.getElementById('financialList');
                    if (!select || !list) 
                        return;
                    const currentCouples = typeof couples !== 'undefined'
                        ? couples
                        : [];
                    const currentClasses = typeof classes !== 'undefined'
                        ? classes
                        : [];
                    const groups = groupFinancialItems(
                        currentCouples,
                        currentClasses,
                        select.value
                    );
                    if (!groups.length) 
                        return;
                    list.innerHTML = groups
                        .map(
                            group => `<tr class="financial-row-clickable" data-financial-group="${escape(group.id)}" tabindex="0" role="button" aria-label="Ver detalhes financeiros de ${escape(group.name)}"><td><div class="financial-row-name"><span class="class-name">${escape(group.name)}</span><span class="financial-row-arrow">›</span></div></td><td>${group.students}</td><td>${formatMoney(group.entries)}</td><td>${formatMoney(group.monthly)}</td><td class="financial-total-cell">${formatMoney(group.received)}</td></tr>`
                        )
                        .join('');
                };

                    const list = document.getElementById('financialList');
                    list
                    ?.addEventListener('click', event => {
                        const row = event
                            .target
                            .closest('[data-financial-group]');
                        if (row) 
                            openGroup(row.dataset.financialGroup);
                        }
                    );
                    list
                    ?.addEventListener('keydown', event => {
                        if (event.key !== 'Enter' && event.key !== ' ') 
                            return;
                        const row = event
                            .target
                            .closest('[data-financial-group]');
                        if (!row) 
                            return;
                        event.preventDefault();
                        openGroup(row.dataset.financialGroup);
                    });
                    document.getElementById('closeFinancialDetail').onclick = () => typeof closeDialog === 'function'
                    ? closeDialog(modal)
                    : modal.close();
                modal.addEventListener('cancel', event => {
                    event.preventDefault();
                    typeof closeDialog === 'function'
                        ? closeDialog(modal)
                        : modal.close();
                });

                if (typeof renderFinancial === 'function') 
                    renderFinancial();
                }
            )(
        typeof window !== 'undefined'
            ? window
            : globalThis
    );
