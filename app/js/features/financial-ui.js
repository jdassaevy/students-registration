(() => {
    const list = document.getElementById('financialList');
    const cards = document.getElementById('financialCards');
    const view = document.getElementById('financialView');

    if (!list || !cards || !view) return;

    const escapeHtml = value => String(value ?? '').replace(
        /[&<>'"]/g,
        char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[char])
    );

    function renderFinancialLoading() {
        view.classList.add('is-financial-loading');
        list.innerHTML = Array.from({length: 3}, () => `
            <tr class="financial-loading-row" aria-hidden="true">
                <td><span class="ui-skeleton financial-skeleton-class"></span></td>
                <td><span class="ui-skeleton financial-skeleton-count"></span></td>
                <td><span class="ui-skeleton financial-skeleton-value"></span></td>
                <td><span class="ui-skeleton financial-skeleton-value"></span></td>
                <td><span class="ui-skeleton financial-skeleton-total"></span></td>
            </tr>`).join('');

        cards.innerHTML = Array.from({length: 3}, () => `
            <article class="financial-card financial-card-skeleton" aria-hidden="true">
                <div class="financial-card-head">
                    <div>
                        <span class="ui-skeleton financial-skeleton-label"></span>
                        <span class="ui-skeleton financial-skeleton-name"></span>
                    </div>
                    <span class="ui-skeleton financial-skeleton-total"></span>
                </div>
                <div class="financial-card-grid">
                    <span class="ui-skeleton"></span>
                    <span class="ui-skeleton"></span>
                    <span class="ui-skeleton"></span>
                </div>
            </article>`).join('');
    }

    function renderFinancialCards() {
        if (list.querySelector('.financial-loading-row')) return;

        view.classList.remove('is-financial-loading');

        const empty = list.querySelector('.empty');
        if (empty) {
            cards.innerHTML = `
                <div class="financial-cards-empty">
                    <strong>Nenhum valor recebido</strong>
                    <span>Marque pagamentos como recebidos para exibi-los aqui.</span>
                </div>`;
            return;
        }

        const rows = [...list.querySelectorAll('tr')].filter(row => row.children.length >= 5);
        cards.innerHTML = rows.length
            ? rows.map(row => {
                const [classCell, studentsCell, entriesCell, monthlyCell, totalCell] = row.children;
                const className = escapeHtml(classCell.textContent.trim() || 'Sem turma');
                const students = escapeHtml(studentsCell.textContent.trim());
                const entries = escapeHtml(entriesCell.textContent.trim());
                const monthly = escapeHtml(monthlyCell.textContent.trim());
                const total = escapeHtml(totalCell.textContent.trim());

                return `<article class="financial-card">
                    <header class="financial-card-head">
                        <div>
                            <span class="financial-card-kicker">Turma</span>
                            <h3>${className}</h3>
                        </div>
                        <div class="financial-card-total">
                            <span>Total recebido</span>
                            <strong>${total}</strong>
                        </div>
                    </header>
                    <div class="financial-card-grid">
                        <div><span>Alunos</span><strong>${students}</strong></div>
                        <div><span>Inscrições</span><strong>${entries}</strong></div>
                        <div><span>Mensalidades</span><strong>${monthly}</strong></div>
                    </div>
                </article>`;
            }).join('')
            : '';
    }

    const observer = new MutationObserver(renderFinancialCards);
    observer.observe(list, {childList: true, subtree: true});

    if (list.children.length) {
        renderFinancialCards();
    } else {
        renderFinancialLoading();
    }
})();
