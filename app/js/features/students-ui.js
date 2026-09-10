(() => {
    const $ = id => document.getElementById(id);

    // DIALOG_LIFECYCLE_GUARD_START
    const dialogCloseSessions = new WeakMap();
    const coreOpenDialog = openDialog;

    openDialog = function (dialog) {
        const session = (dialogCloseSessions.get(dialog) || 0) + 1;
        dialogCloseSessions.set(dialog, session);
        coreOpenDialog(dialog);
    };

    closeDialog = function (dialog) {
        if (!dialog.open || dialog.classList.contains('is-closing')) return;

        const session = (dialogCloseSessions.get(dialog) || 0) + 1;
        dialogCloseSessions.set(dialog, session);
        dialog.classList.add('is-closing');

        const finish = () => {
            if (dialogCloseSessions.get(dialog) !== session) return;
            dialog.classList.remove('is-closing');
            if (dialog.open) dialog.close();
        };

        dialog.addEventListener('transitionend', finish, {once: true});
        setTimeout(finish, 280);
    };
    // DIALOG_LIFECYCLE_GUARD_END

    function paymentButtons(couple, person, name) {
        return `<div class="student-card-person">
            <span class="student-card-person-name">${escapeHtml(name)}</span>
            <div class="payments" aria-label="Mensalidades de ${escapeHtml(name)}">
                ${couple.payments[person].map((paid, index) => `
                    <button type="button" class="month ${paid ? 'on' : ''}" onclick="toggleMonth('${couple.id}','${person}',${index})" aria-label="${index + 1}ª mensalidade de ${escapeHtml(name)}: ${paid ? 'paga' : 'pendente'}">
                        ${paid ? '✓' : index + 1}
                    </button>`).join('')}
            </div>
        </div>`;
    }

    function entryButton(couple, person, name) {
        const paid = couple.entryPayments[person];
        return `<div class="student-card-person">
            <span class="student-card-person-name">${escapeHtml(name)}</span>
            <button type="button" class="pill ${paid ? 'paid' : 'pending'}" onclick="toggleEntry('${couple.id}','${person}')">
                ${paid ? 'Paga' : 'Pendente'}
            </button>
        </div>`;
    }

    function studentCardMarkup(couple) {
        const paid1 = couple.payments.person1.filter(Boolean).length;
        const paid2 = couple.person2
            ? couple.payments.person2.filter(Boolean).length
            : 0;
        const paidMonths = paid1 + paid2;
        const totalMonths = couple.person2 ? 6 : 3;
        const progress = totalMonths ? Math.round((paidMonths / totalMonths) * 100) : 0;
        const classItem = classById(couple.classId);
        const names = `${escapeHtml(couple.person1)}${couple.person2 ? ` <span>&amp;</span> ${escapeHtml(couple.person2)}` : ''}`;

        return `<article class="student-card">
            <header class="student-card-head">
                <div class="student-card-identity">
                    <span class="student-card-type">${couple.person2 ? 'Casal' : 'Aluno individual'}</span>
                    <h3>${names}</h3>
                    <p>${classItem ? escapeHtml(classItem.name) : 'Sem turma'} <span>•</span> ${escapeHtml(couple.createdAt)}</p>
                </div>
                <div class="student-card-actions actions">
                    <button type="button" class="icon-btn" onclick="editCouple('${couple.id}')" aria-label="Editar cadastro">✎</button>
                    <button type="button" class="icon-btn" onclick="removeCouple('${couple.id}')" aria-label="Excluir cadastro">⌫</button>
                </div>
            </header>

            <div class="student-card-progress-summary">
                <div>
                    <span>Mensalidades concluídas</span>
                    <strong>${paidMonths} de ${totalMonths}</strong>
                </div>
                <span class="student-card-progress-value">${progress}%</span>
                <div class="student-card-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
            </div>

            <div class="student-card-payment-grid">
                <section class="student-card-payment-block">
                    <div class="student-card-payment-title"><span>Inscrição</span><small>Toque para alterar</small></div>
                    ${entryButton(couple, 'person1', couple.person1)}
                    ${couple.person2 ? entryButton(couple, 'person2', couple.person2) : ''}
                </section>
                <section class="student-card-payment-block">
                    <div class="student-card-payment-title"><span>Mensalidades</span><small>1ª · 2ª · 3ª</small></div>
                    ${paymentButtons(couple, 'person1', couple.person1)}
                    ${couple.person2 ? paymentButtons(couple, 'person2', couple.person2) : ''}
                </section>
            </div>
        </article>`;
    }

    function filteredStudents() {
        const search = $('search');
        const classFilter = $('classFilter');
        if (!search || !classFilter) return [];

        const query = search.value.toLowerCase().trim();
        const filter = classFilter.value;
        return couples
            .filter(couple => filter === 'all' || (filter === 'none' ? !couple.classId : couple.classId === filter))
            .filter(couple => `${couple.person1} ${couple.person2 || ''}`.toLowerCase().includes(query));
    }

    function renderStudentCards() {
        const cards = $('studentCards');
        if (!cards) return;
        const items = filteredStudents();
        $('studentCards').innerHTML = items.length
            ? items.map(studentCardMarkup).join('')
            : '<div class="student-cards-empty"><strong>Nenhum cadastro encontrado</strong><span>Cadastre um aluno ou altere os filtros.</span></div>';
    }

    function renderStudentsLoading() {
        const list = $('list');
        const cards = $('studentCards');
        if (!list || !cards) return;

        list.innerHTML = Array.from({length: 4}, () => `
            <tr class="students-loading-row" aria-hidden="true">
                <td><span class="ui-skeleton students-skeleton-name"></span><span class="ui-skeleton students-skeleton-meta"></span></td>
                <td><span class="ui-skeleton students-skeleton-chip"></span></td>
                <td><span class="ui-skeleton students-skeleton-payment"></span></td>
                <td><span class="ui-skeleton students-skeleton-payment"></span></td>
                <td><span class="ui-skeleton students-skeleton-progress"></span></td>
                <td><span class="ui-skeleton students-skeleton-actions"></span></td>
            </tr>`).join('');

        cards.innerHTML = Array.from({length: 3}, () => `
            <article class="student-card student-card-skeleton" aria-hidden="true">
                <div class="student-card-skeleton-head">
                    <div><span class="ui-skeleton students-skeleton-name"></span><span class="ui-skeleton students-skeleton-meta"></span></div>
                    <span class="ui-skeleton students-skeleton-actions"></span>
                </div>
                <span class="ui-skeleton student-card-skeleton-progress"></span>
                <div class="student-card-skeleton-grid"><span class="ui-skeleton"></span><span class="ui-skeleton"></span></div>
            </article>`).join('');
    }

    const list = $('list');
    if (!list) return;

    const loadingObserver = new MutationObserver(() => {
        if (list.querySelector('.loading-state')) {
            renderStudentsLoading();
        }
    });
    loadingObserver.observe(list, {childList: true, subtree: true});

    const originalRender = render;
    render = function () {
        originalRender();
        renderStudentCards();
    };

    if (list.querySelector('.loading-state')) {
        renderStudentsLoading();
    } else if (list.children.length) {
        renderStudentCards();
    }
})();
