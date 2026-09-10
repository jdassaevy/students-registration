(() => {
    const nav = document.querySelector('.view-tabs');
    const main = document.querySelector('main.app');
    const studentsTab = document.getElementById('studentsTab');
    const financialView = document.getElementById('financialView');
    if (!nav || !main || !studentsTab || !financialView || document.getElementById('classesView')) return;

    const classesTab = document.createElement('button');
    classesTab.type = 'button';
    classesTab.className = 'view-tab';
    classesTab.id = 'classesTab';
    classesTab.textContent = 'Turmas';
    studentsTab.insertAdjacentElement('afterend', classesTab);

    const section = document.createElement('section');
    section.id = 'classesView';
    section.className = 'classes-page';
    section.hidden = true;
    section.setAttribute('aria-busy', 'true');
    section.innerHTML = `
        <div id="classesSkeleton" class="classes-skeleton" aria-hidden="true">
            <div class="classes-skeleton-head">
                <div class="classes-skeleton-copy">
                    <span class="ui-skeleton classes-skeleton-line classes-skeleton-line--short"></span>
                    <span class="ui-skeleton classes-skeleton-line classes-skeleton-line--title"></span>
                    <span class="ui-skeleton classes-skeleton-line"></span>
                </div>
                <span class="ui-skeleton classes-skeleton-button"></span>
            </div>
            <div class="classes-skeleton-stats">
                ${Array.from({length: 4}, () => '<span class="ui-skeleton classes-skeleton-stat"></span>').join('')}
            </div>
            <div class="classes-skeleton-grid">
                ${Array.from({length: 4}, () => `
                    <article class="classes-skeleton-card">
                        <span class="ui-skeleton classes-skeleton-line classes-skeleton-line--short"></span>
                        <span class="ui-skeleton classes-skeleton-line classes-skeleton-line--title"></span>
                        <span class="ui-skeleton classes-skeleton-line"></span>
                        <span class="ui-skeleton classes-skeleton-card-actions"></span>
                    </article>`).join('')}
            </div>
        </div>

        <div id="classesContent" class="classes-content" hidden>
            <header class="classes-page-head">
                <div class="classes-page-head-copy">
                    <span class="classes-kicker">Turmas</span>
                    <h2>Organização das turmas</h2>
                    <p>Visualize distribuição de alunos, local e horários usando os mesmos cadastros já existentes.</p>
                </div>
                <button type="button" class="btn btn-primary" id="classesNewBtn">＋ Nova turma</button>
            </header>

            <section class="classes-stats" aria-label="Resumo das turmas">
                <article class="classes-stat"><span>Turmas ativas</span><strong id="classesTotal">0</strong></article>
                <article class="classes-stat"><span>Alunos vinculados</span><strong id="classesStudents">0</strong></article>
                <article class="classes-stat"><span>Média por turma</span><strong id="classesAverage">0</strong></article>
                <article class="classes-stat"><span>Alunos sem turma</span><strong id="classesUnassigned">0</strong></article>
            </section>

            <section class="classes-directory panel" aria-label="Turmas cadastradas">
                <div class="classes-directory-head">
                    <div>
                        <span class="classes-kicker">Estrutura</span>
                        <h3>Turmas cadastradas</h3>
                    </div>
                    <span class="classes-directory-note">Ações usam os fluxos atuais de alunos e DOCX.</span>
                </div>
                <div id="classesGrid" class="classes-grid" aria-live="polite"></div>
            </section>
        </div>`;
    financialView.insertAdjacentElement('beforebegin', section);

    const classesSkeleton = document.getElementById('classesSkeleton');
    const classesContent = document.getElementById('classesContent');
    const classesGrid = document.getElementById('classesGrid');
    let classesReady = false;

    function personCount(items) {
        return items.reduce((total, couple) => total + (couple.person2 ? 2 : 1), 0);
    }

    function setClassesLoading(loading) {
        const active = Boolean(loading);
        section.setAttribute('aria-busy', String(active));
        classesSkeleton.hidden = !active;
        classesSkeleton.setAttribute('aria-hidden', String(!active));
        classesContent.hidden = active;
    }

    function classCardMarkup(item) {
        const classCouples = couples.filter(couple => couple.classId === item.id);
        const students = personCount(classCouples);
        const details = [item.place, item.schedule].filter(Boolean);
        const detailText = details.length ? details.map(escapeHtml).join(' • ') : 'Sem local ou horário cadastrado';
        const safeId = escapeHtml(item.id);

        return `
            <article class="classes-card">
                <header class="classes-card-head">
                    <div>
                        <span class="classes-card-label">Turma ativa</span>
                        <h3>${escapeHtml(item.name)}</h3>
                        <p>${detailText}</p>
                    </div>
                    <span class="classes-card-count"><strong>${students}</strong> aluno${students === 1 ? '' : 's'}</span>
                </header>
                <div class="classes-card-meta">
                    <span>${classCouples.length} cadastro${classCouples.length === 1 ? '' : 's'} vinculado${classCouples.length === 1 ? '' : 's'}</span>
                </div>
                <footer class="classes-card-actions">
                    <button type="button" class="btn btn-light" data-class-view-students="${safeId}">Ver alunos</button>
                    <button type="button" class="btn btn-light" data-class-export="${safeId}" aria-busy="false">⇩ Lista DOCX</button>
                    <button type="button" class="classes-delete-action" data-delete-class="${safeId}" aria-label="Excluir turma ${escapeHtml(item.name)}">Excluir</button>
                </footer>
            </article>`;
    }

    function renderClasses() {
        const classIds = new Set(classes.map(item => item.id));
        const linkedCouples = couples.filter(couple => couple.classId && classIds.has(couple.classId));
        const unassignedCouples = couples.filter(couple => !couple.classId || !classIds.has(couple.classId));
        const linkedStudents = personCount(linkedCouples);
        const unassignedStudents = personCount(unassignedCouples);
        const average = classes.length ? linkedStudents / classes.length : 0;

        document.getElementById('classesTotal').textContent = classes.length;
        document.getElementById('classesStudents').textContent = linkedStudents;
        document.getElementById('classesAverage').textContent = new Intl.NumberFormat('pt-BR', {
            maximumFractionDigits: 1
        }).format(average);
        document.getElementById('classesUnassigned').textContent = unassignedStudents;

        classesGrid.innerHTML = classes.length
            ? classes.map(classCardMarkup).join('')
            : `<div class="classes-empty">
                <strong>Nenhuma turma cadastrada</strong>
                <span>Crie sua primeira turma para organizar alunos, horários e listas.</span>
                <button type="button" class="btn btn-primary" data-create-first-class>＋ Criar primeira turma</button>
            </div>`;

        classesReady = true;
        setClassesLoading(false);
    }

    function openClassModal() {
        const sourceButton = document.getElementById('newClassBtn');
        if (sourceButton) sourceButton.click();
    }

    function showClassStudents(classId) {
        const filter = document.getElementById('classFilter');
        if (!filter) return;
        filter.value = classId;
        filter.dispatchEvent(new Event('change', {bubbles: true}));
        setView('students');
    }

    async function exportClassDocument(classId, button) {
        const filter = document.getElementById('classFilter');
        if (!filter || typeof exportSelectedClass !== 'function' || button.disabled) return;

        const previous = filter.value;
        const previousText = button.textContent;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Gerando...';
        filter.value = classId;
        try {
            await exportSelectedClass();
        } finally {
            filter.value = previous;
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            button.textContent = previousText;
        }
    }

    document.getElementById('classesNewBtn').addEventListener('click', openClassModal);
    classesGrid.addEventListener('click', async event => {
        const createButton = event.target.closest('[data-create-first-class]');
        if (createButton) {
            openClassModal();
            return;
        }

        const studentsButton = event.target.closest('[data-class-view-students]');
        if (studentsButton) {
            showClassStudents(studentsButton.dataset.classViewStudents);
            return;
        }

        const exportButton = event.target.closest('[data-class-export]');
        if (exportButton) {
            await exportClassDocument(exportButton.dataset.classExport, exportButton);
            return;
        }

        const deleteButton = event.target.closest('[data-delete-class]');
        if (deleteButton && typeof removeClass === 'function') {
            await removeClass(deleteButton.dataset.deleteClass);
        }
    });

    const originalRender = render;
    render = function () {
        originalRender();
        renderClasses();
    };

    const originalSetView = setView;
    setView = function (view) {
        if (view !== 'classes') {
            section.hidden = true;
            classesTab.classList.remove('active');
            return originalSetView(view);
        }

        activeView = 'classes';
        section.hidden = false;
        ['dashboardView', 'studentsView', 'financialView', 'reportsView', 'automationView'].forEach(id => {
            const viewElement = document.getElementById(id);
            if (viewElement) viewElement.hidden = true;
        });
        document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
        classesTab.classList.add('active');

        if (classesReady) {
            renderClasses();
        } else {
            setClassesLoading(true);
        }

        if (typeof animateView === 'function') animateView(section);
    };

    classesTab.addEventListener('click', () => setView('classes'));
})();
