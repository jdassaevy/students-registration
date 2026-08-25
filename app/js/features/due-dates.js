(function (root) {
    function parseDateOnly(value) {
        if (!value) 
            return null;
        const parts = String(value)
            .split('-')
            .map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) 
            return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function toDateOnly(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function addMonthsClamped(start, months) {
        const source = start instanceof Date
            ? new Date(start.getFullYear(), start.getMonth(), start.getDate())
            : parseDateOnly(start);
        if (!source) 
            return null;
        const targetMonth = source.getMonth() + months;
        const lastDay = new Date(source.getFullYear(), targetMonth + 1, 0).getDate();
        return new Date(
            source.getFullYear(),
            targetMonth,
            Math.min(source.getDate(), lastDay)
        );
    }

    function calculateMonthlyDueDates(startDate, count = 3) {
        const start = parseDateOnly(startDate);
        if (!start) 
            return [];
        return Array.from({
            length: count
        }, (_, index) => toDateOnly(addMonthsClamped(start, index)));
    }

    function formatDate(value) {
        const date = parseDateOnly(value);
        return date
            ? new Intl
                .DateTimeFormat('pt-BR')
                .format(date)
            : 'Não definido';
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            parseDateOnly,
            addMonthsClamped,
            calculateMonthlyDueDates,
            formatDate
        };
    }

    if (!root || !root.document) 
        return;
    const document = root.document;
    const starts = new Map();
    let activeFinancialClassId = null;

    root.DueDates = {
        calculateMonthlyDueDates,
        formatDate,
        getClassStartDate: id => starts.get(id) || '',
        getDueDates: id => calculateMonthlyDueDates(starts.get(id) || '')
    };

    const style = document.createElement('style');
    style.textContent = `
    .class-start-helper{margin:4px 0 0;color:var(--muted);font-size:11px;line-height:1.4}
    .due-date-caption{display:block;margin-top:4px;color:var(--muted);font-size:9px;font-weight:700}
    .financial-due-banner{margin:0 0 14px;padding:12px 14px;border:1px solid var(--line);border-radius:13px;background:#faf7f2;color:var(--muted);font-size:11px}
    .financial-due-banner strong{color:var(--wine-dark)}
  `;
    document
        .head
        .appendChild(style);

    const classSchedule = document.getElementById('classSchedule');
    if (classSchedule) {
        const startField = document.createElement('div');
        startField.className = 'field';
        startField.innerHTML = `<label for="classStartDate">Data de início da turma</label><input id="classStartDate" type="date" required><p class="class-start-helper">Define os vencimentos da 1ª, 2ª e 3ª mensalidades.</p>`;
        classSchedule
                .closest('.field')
                ?
                .insertAdjacentElement('afterend', startField);
    }

    async function loadClassStarts() {
        try {
            const {data, error} = await db
                .from('classes')
                .select('id,start_date');
            if (error) 
                throw error;
            starts.clear();
            (data || []).forEach(item => {
                if (item.start_date) 
                    starts.set(item.id, item.start_date);
                }
            );
            decorateClassList();
        } catch (error) {
            console.warn('Não foi possível carregar vencimentos:', error.message);
        }
    }

    function decorateClassList() {
        const items = [...document.querySelectorAll('#classList .class-item')];
        items.forEach((element, index) => {
            element
                    .querySelector('.class-due-info')
                    ?
                    .remove();
            const classItem = typeof classes !== 'undefined'
                ? classes[index]
                : null;
            if (!classItem) 
                return;
            const start = starts.get(classItem.id);
            if (!start) 
                return;
            const due = calculateMonthlyDueDates(start);
            const info = document.createElement('small');
            info.className = 'class-due-info';
            info.style.display = 'block';
            info.style.marginTop = '4px';
            info.style.color = 'var(--muted)';
            info.textContent = `Início: ${formatDate(start)} • Vencimentos: ${due
                .map(
                    formatDate
                )
                .join(' • ')}`;
            element
                    .querySelector('div')
                    ?
                    .appendChild(info);
        });
    }

    const originalRenderClassList = typeof renderClassList === 'function'
        ? renderClassList
        : null;
    if (originalRenderClassList) {
        renderClassList = function () {
            originalRenderClassList();
            decorateClassList();
        };
    }

    const classForm = document.getElementById('classForm');
    classForm
        ?.addEventListener('submit', async event => {
            event.preventDefault();
            event.stopImmediatePropagation();

            const startDate = document.getElementById('classStartDate')
                ?.value || '';
            if (!startDate) {
                if (typeof toast === 'function') 
                    toast('Defina a data de início da turma.');
                return;
            }

            const payload = {
                name: document
                    .getElementById('className')
                    .value
                    .trim(),
                place: document
                    .getElementById('classPlace')
                    .value
                    .trim(),
                schedule: document
                    .getElementById('classSchedule')
                    .value
                    .trim(),
                start_date: startDate
            };

            const {data, error} = await db
                .from('classes')
                .insert(payload)
                .select()
                .single();
            if (error) {
                if (typeof toast === 'function') 
                    toast('Não foi possível criar a turma.');
                return;
            }

            const mapped = typeof fromClass === 'function'
                ? fromClass(data)
                : {
                    id: data.id,
                    name: data.name,
                    place: data.place || '',
                    schedule: data.schedule || ''
                };
            classes.push(mapped);
            starts.set(data.id, data.start_date || startDate);
            classForm.reset();
            if (typeof render === 'function') 
                render();
            if (typeof renderClassList === 'function') 
                renderClassList();
            if (typeof toast === 'function') 
                toast('Turma criada com vencimentos definidos!');
            }
        , true);

    function decorateFinancialDetails() {
        const content = document.getElementById('financialDetailContent');
        if (!content || !activeFinancialClassId) 
            return;
        content
                .querySelector('.financial-due-banner')
                ?
                .remove();
        const start = starts.get(activeFinancialClassId);
        if (!start) 
            return;
        const dueDates = calculateMonthlyDueDates(start);
        const banner = document.createElement('div');
        banner.className = 'financial-due-banner';
        banner.innerHTML = `<strong>Início da turma:</strong> ${formatDate(start)} &nbsp;•&nbsp; <strong>Vencimentos:</strong> ${dueDates
            .map(
                (date, index) => `${index + 1}ª ${formatDate(date)}`
            )
            .join(' • ')}`;
        content.prepend(banner);

        [...content.querySelectorAll('.financial-month-statuses')].forEach(group => {
            [...group.querySelectorAll('.financial-month-chip')].forEach((chip, index) => {
                chip
                        .querySelector('.due-date-caption')
                        ?
                        .remove();
                const caption = document.createElement('span');
                caption.className = 'due-date-caption';
                caption.textContent = formatDate(dueDates[index]);
                chip.style.height = 'auto';
                chip.style.minHeight = '38px';
                chip.style.flexDirection = 'column';
                chip.style.padding = '5px 8px';
                chip.appendChild(caption);
            });
        });
    }

    document.addEventListener('click', event => {
        const row = event.target.closest
            ?.('[data-financial-group]');
        if (!row) 
            return;
        activeFinancialClassId = row.dataset.financialGroup;
        setTimeout(decorateFinancialDetails, 0);
    }, true);

    document.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') 
            return;
        const row = event.target.closest
            ?.('[data-financial-group]');
        if (!row) 
            return;
        activeFinancialClassId = row.dataset.financialGroup;
        setTimeout(decorateFinancialDetails, 0);
    }, true);

    db
        .auth
        .onAuthStateChange((event, session) => {
            if (
                session
                    ?.user
            ) 
                setTimeout(loadClassStarts, 0);
            else 
                starts.clear();
            }
        );

    db
        .auth
        .getSession()
        .then(({data}) => {
            if (
                data
                    ?.session
                        ?.user
            ) 
                loadClassStarts();
            }
        );
})(
    typeof window !== 'undefined'
        ? window
        : globalThis
);
