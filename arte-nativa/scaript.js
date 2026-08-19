const KEY = 'arteNativaCasais_v1';
const CLASSES_KEY = 'arteNativaTurmas_v1';
let couples = JSON.parse(localStorage.getItem(KEY) || '[]');
let classes = JSON.parse(localStorage.getItem(CLASSES_KEY) || '[]');
const $ = id => document.getElementById(id);
const makeId = () => typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date
        .now()
        .toString(36) + Math
        .random()
        .toString(36)
        .slice(2);
const save = () => {
    localStorage.setItem(KEY, JSON.stringify(couples));
    localStorage.setItem(CLASSES_KEY, JSON.stringify(classes));
    render();
};
const escapeHtml = value => String(value).replace(
    /[&<>'"]/g,
    c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c])
);
function toast(message) {
    $('toast').textContent = message;
    $('toast')
        .classList
        .add('show');
    setTimeout(() => $('toast').classList.remove('show'), 2200);
}
function stats() {
    const total = couples.length,
        entries = couples
            .filter(c => c.entry)
            .length,
        paid = couples.reduce((n, c) => n + c.months.filter(Boolean).length, 0);
    $('statTotal').textContent = total;
    $('statEntries').textContent = entries;
    $('statPayments').textContent = paid;
    $('statClasses').textContent = classes.length;
}
function classById(id) {
    return classes.find(item => item.id === id);
}
function renderClassOptions() {
    const selectedFilter = $('classFilter').value;
    const selectedCoupleClass = $('coupleClass').value;
    const options = classes
        .map(
            item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`
        )
        .join('');
    $('classFilter').innerHTML = `<option value="all">Todas as turmas</option><option value="none">Sem turma</option>${options}`;
    $('coupleClass').innerHTML = `<option value="">Sem turma</option>${options}`;
    if ([...$('classFilter').options].some(option => option.value === selectedFilter)) 
        $('classFilter').value = selectedFilter;
    if ([...$('coupleClass').options].some(option => option.value === selectedCoupleClass)) 
        $('coupleClass').value = selectedCoupleClass;
    }
function renderClassList() {
    $('classList').innerHTML = classes.length
        ? classes
            .map(item => {
                const total = couples
                    .filter(c => c.classId === item.id)
                    .length;
                const details = [item.place, item.schedule]
                    .filter(Boolean)
                    .join(' • ') || 'Sem detalhes';
                return `<div class="class-item"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(
                    details
                )} • ${total} casal${total === 1
                    ? ''
                    : 'is'}</small></div><button type="button" class="icon-btn" title="Excluir turma" data-delete-class="${item.id}">⌫</button></div>`;
            })
            .join('')
        : '<div class="empty"><b>Nenhuma turma criada</b>Cadastre a primeira turma acima.' +
                '</div>';
}
function render() {
    renderClassOptions();
    const q = $('search')
        .value
        .toLowerCase()
        .trim();
    const classFilter = $('classFilter').value;
    const filtered = couples.filter(c => {
        const matchesName = (c.person1 + ' ' + c.person2)
            .toLowerCase()
            .includes(q);
        const matchesClass = classFilter === 'all' || (
            classFilter === 'none'
                ? !c.classId
                : c.classId === classFilter
        );
        return matchesName && matchesClass;
    });
    $('list').innerHTML = filtered.length
        ? filtered
            .map(c => {
                const paid = c
                    .months
                    .filter(Boolean)
                    .length;
                const classItem = classById(c.classId);
                return `<tr><td class="couple"><strong>${escapeHtml(c.person1)} &amp; ${escapeHtml(
                    c.person2
                )}</strong><small>Cadastrado em ${c.createdAt}</small></td>
          <td><span class="class-name">${classItem
                    ? escapeHtml(classItem.name)
                    : 'Sem turma'}</span></td>
          <td><button class="pill ${c.entry
                        ? 'paid'
                        : 'pending'}" onclick="toggleEntry('${c.id}')">${c.entry
                            ? 'Paga'
                            : 'Pendente'}</button></td>
          <td><div class="payments">${c
                                .months
                                .map(
                                    (on, i) => `<button class="month ${on
                                        ? 'on'
                                        : ''}" title="${i + 1}ª mensalidade" onclick="toggleMonth('${c.id}',${i})">${on
                                            ? '✓'
                                            : i + 1}</button>`
                                )
                                .join('')}</div></td>
          <td class="count"><b>${paid} de 3</b> pagas</td><td><div class="actions"><button class="icon-btn" type="button" title="Editar" onclick="editCouple('${c
                                .id}')">✎</button><button class="icon-btn delete-btn" type="button" title="Excluir" aria-label="Excluir casal" data-delete-id="${c
                                .id}">⌫</button></div></td></tr>`;
            })
            .join('')
        : `<tr><td colspan="6" class="empty"><b>Nenhum casal encontrado</b>${couples.length
            ? 'Altere a busca ou o filtro de turma.'
            : 'Clique em “Cadastrar casal” para começar.'}</td></tr>`;
    stats();
}
function openNew() {
    $('form').reset();
    $('editingId').value = '';
    $('modalTitle').textContent = 'Cadastrar casal';
    renderClassOptions();
    $('modal').showModal();
    $('person1').focus();
}
function editCouple(id) {
    const c = couples.find(x => x.id === id);
    if (!c) 
        return;
    $('editingId').value = id;
    $('person1').value = c.person1;
    $('person2').value = c.person2;
    $('coupleClass').value = c.classId || '';
    $('entry').checked = c.entry;
    c
        .months
        .forEach((v, i) => $('m' + (
            i + 1
        )).checked = v);
    $('modalTitle').textContent = 'Editar casal';
    $('modal').showModal();
}
function toggleEntry(id) {
    const c = couples.find(x => x.id === id);
    c.entry = !c.entry;
    save();
    toast('Inscrição atualizada.');
}
function toggleMonth(id, index) {
    const c = couples.find(x => x.id === id);
    c.months[index] = !c.months[index];
    save();
    toast('Mensalidade atualizada.');
}
function removeCouple(id) {
    const c = couples.find(x => x.id === id);
    if (!c) 
        return;
    
    const confirmed = window.confirm(
        `Excluir o cadastro de ${c.person1} e ${c.person2}?`
    );
    if (!confirmed) 
        return;
    
    couples = couples.filter(x => x.id !== id);
    save();
    toast('Cadastro excluído.');
}
function removeClass(id) {
    const item = classById(id);
    if (!item) 
        return;
    const total = couples
        .filter(c => c.classId === id)
        .length;
    if (!window.confirm(
        `Excluir a turma “${item.name}”? ${total
            ? `Os ${total} casais ficarão sem turma.`
            : ''}`
    )) 
        return;
    couples.forEach(c => {
        if (c.classId === id) 
            c.classId = '';
        }
    );
    classes = classes.filter(item => item.id !== id);
    save();
    renderClassList();
    toast('Turma excluída.');
}
$('form').addEventListener('submit', e => {
    e.preventDefault();
    const id = $('editingId').value;
    const data = {
        person1: $('person1')
            .value
            .trim(),
        person2: $('person2')
            .value
            .trim(),
        classId: $('coupleClass').value,
        entry: $('entry').checked,
        months: [1, 2, 3].map(i => $('m' + i).checked)
    };
    if (id) {
        const old = couples.find(c => c.id === id);
        Object.assign(old, data);
        toast('Cadastro atualizado.');
    } else {
        couples.unshift({
            id: makeId(),
            createdAt: new Date().toLocaleDateString('pt-BR'),
            ...data
        });
        toast('Casal cadastrado!');
    }
    save();
    $('modal').close();
});
$('classForm').addEventListener('submit', e => {
    e.preventDefault();
    classes.push({
        id: makeId(),
        name: $('className')
            .value
            .trim(),
        place: $('classPlace')
            .value
            .trim(),
        schedule: $('classSchedule')
            .value
            .trim()
    });
    $('classForm').reset();
    save();
    renderClassList();
    $('className').focus();
    toast('Nova turma criada!');
});
$('newBtn').onclick = openNew;
$('newClassBtn').onclick = () => {
    $('classForm').reset();
    renderClassList();
    $('classModal').showModal();
    $('className').focus();
};
$('closeBtn').onclick = () => $('modal').close();
$('cancelBtn').onclick = () => $('modal').close();
$('closeClassBtn').onclick = () => $('classModal').close();
$('cancelClassBtn').onclick = () => $('classModal').close();
$('search').oninput = render;
$('classFilter').onchange = render;
$('list').addEventListener('click', event => {
    const deleteButton = event
        .target
        .closest('[data-delete-id]');
    if (!deleteButton) 
        return;
    removeCouple(deleteButton.dataset.deleteId);
});
$('classList').addEventListener('click', event => {
    const button = event
        .target
        .closest('[data-delete-class]');
    if (button) 
        removeClass(button.dataset.deleteClass);
    }
);
$('modal').addEventListener('click', e => {
    if (e.target === $('modal')) 
        $('modal').close();
    }
);
$('classModal').addEventListener('click', e => {
    if (e.target === $('classModal')) 
        $('classModal').close();
    }
);
render();