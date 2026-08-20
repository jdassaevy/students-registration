const db = window
    .supabase
    .createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey);
const LOCAL_COUPLES_KEY = 'arteNativaCasais_v1';
const LOCAL_CLASSES_KEY = 'arteNativaTurmas_v1';
const $ = id => document.getElementById(id);
let currentUser = null;
let recoverySession = null;
let couples = [];
let classes = [];
let authMode = 'login';
let activeView = 'students';

const escapeHtml = value => String(value ?? '').replace(
    /[&<>'"]/g,
    c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c])
);
const normalizePayments = value => ({
    person1: Array.isArray(
        value
            ?.person1
    )
        ? value
            .person1
            .slice(0, 3)
            .map(Boolean)
        : [
            false, false, false
        ],
    person2: Array.isArray(
        value
            ?.person2
    )
        ? value
            .person2
            .slice(0, 3)
            .map(Boolean)
        : [false, false, false]
});
const normalizeEntryPayments = (value, legacyEntry = false, hasPerson2 = false) => ({
    person1: typeof value?.person1 === 'boolean' ? value.person1 : Boolean(legacyEntry),
    person2: typeof value?.person2 === 'boolean' ? value.person2 : Boolean(legacyEntry && hasPerson2)
});
const normalizeFees = value => ({
    person1: {
        entry: Math.max(0, Number(value?.person1?.entry) || 0),
        monthly: Math.max(0, Number(value?.person1?.monthly) || 0)
    },
    person2: {
        entry: Math.max(0, Number(value?.person2?.entry) || 0),
        monthly: Math.max(0, Number(value?.person2?.monthly) || 0)
    }
});
const money = value => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
});
const inputMoney = id => Math.max(0, Number($(id).value) || 0);
const fromStudent = row => ({
    id: row.id,
    person1: row.person1,
    person2: row.person2 || '',
    classId: row.class_id || '',
    entryPayments: normalizeEntryPayments(row.entry_payments, row.entry_paid, Boolean(row.person2)),
    fees: normalizeFees(row.fees),
    payments: normalizePayments(row.payments),
    createdAt: new Date(row.created_at).toLocaleDateString('pt-BR')
});
const fromClass = row => ({
    id: row.id,
    name: row.name,
    place: row.place || '',
    schedule: row.schedule || ''
});

function toast(message) {
    $('toast').textContent = message;
    $('toast')
        .classList
        .add('show');
    setTimeout(() => $('toast').classList.remove('show'), 2400);
}
function authMessage(message, success = false) {
    $('authMessage').textContent = message;
    $('authMessage')
        .classList
        .toggle('success', success);
}
function setLoading(button, loading, text) {
    button.disabled = loading;
    button.dataset.label ||= button.textContent;
    button.textContent = loading
        ? text
        : button.dataset.label;
}
function showAuth() {
    $('authView').hidden = false;
    $('appView').hidden = true;
}
function showApp() {
    $('authView').hidden = true;
    $('appView').hidden = false;
    $('userEmail').textContent = currentUser
        ?.email || '';
}

function setAuthMode(mode) {
    authMode = mode;
    $('authForm').reset();
    authMessage('');
    $('passwordField').hidden = mode === 'reset';
    $('authTitle').textContent = mode === 'login'
        ? 'Entrar na sua conta'
        : mode === 'register'
            ? 'Criar conta da academia'
            : mode === 'reset'
                ? 'Recuperar senha'
                : 'Criar nova senha';
    $('authSubtitle').textContent = mode === 'register'
        ? 'Seus alunos e turmas ficarão separados das outras contas.'
        : mode === 'reset'
            ? 'Enviaremos um link de recuperação para seu e-mail.'
            : mode === 'update-password'
                ? 'Digite e confirme a nova senha da sua conta.'
                : 'Acesse suas turmas e alunos em qualquer dispositivo.';
    $('authSubmit').textContent = mode === 'login'
        ? 'Entrar'
        : mode === 'register'
            ? 'Criar conta'
            : mode === 'reset'
                ? 'Enviar link'
                : 'Salvar nova senha';
    $('authSubmit').dataset.label = $('authSubmit').textContent;
    $('toggleAuthMode').textContent = mode === 'register'
        ? 'Já tenho uma conta'
        : 'Criar uma conta';
    const updatingPassword = mode === 'update-password';

    $('emailField').hidden = updatingPassword;
    $('passwordField').hidden = mode === 'reset';
    $('confirmPasswordField').hidden = !updatingPassword;

    $('authEmail').required = !updatingPassword;
    $('authPassword').required = mode !== 'reset';
    $('authPasswordConfirmation').required = updatingPassword;

    $('authPassword').autocomplete = updatingPassword
        ? 'new-password'
        : 'current-password';

    $('toggleAuthMode').hidden = updatingPassword;
    $('forgotPassword').hidden = mode === 'reset' || updatingPassword;
}

async function handleAuth(event) {
    event.preventDefault();
    const button = $('authSubmit');
    const email = $('authEmail')
        .value
        .trim();
    const password = $('authPassword').value;
    setLoading(button, true, 'Aguarde...');
    authMessage('');
    try {
        if (authMode === 'update-password') {
            const confirmation = $('authPasswordConfirmation').value;

            if (password.length < 6) {
                throw new Error('Password should be at least 6 characters');
            }

            if (password !== confirmation) {
                throw new Error('Passwords do not match');
            }

            const {error} = await db
                .auth
                .updateUser({password});

            if (error) {
                throw error;
            }

            await db
                .auth
                .signOut();
            setAuthMode('login');
            authMessage('Senha alterada com sucesso! Entre com sua nova senha.', true);
        } else if (authMode === 'register') {
            const {error} = await db
                .auth
                .signUp({email, password});
            if (error) 
                throw error;
            setAuthMode('login');
            authMessage('Conta criada! Confira seu e-mail para confirmar o acesso.', true);
        } else if (authMode === 'reset') {
            const {error} = await db
                .auth
                .resetPasswordForEmail(email, {
                    redirectTo: location
                        .href
                        .split('#')[0]
                });
            if (error) 
                throw error;
            authMessage('Link de recuperação enviado para seu e-mail.', true);
        } else {
            const {error} = await db
                .auth
                .signInWithPassword({email, password});
            if (error) 
                throw error;
            }
        } catch (error) {
        authMessage(translateError(error.message));
    } finally {
        setLoading(button, false, '');
    }
}

function translateError(message = '') {
    if (message.includes('Invalid login')) 
        return 'E-mail ou senha incorretos.';
    if (message.includes('Email not confirmed')) 
        return 'Confirme seu e-mail antes de entrar.';
    if (message.includes('already registered')) 
        return 'Este e-mail já possui uma conta.';
    if (message.includes('Password should')) 
        return 'A senha precisa ter pelo menos 6 caracteres.';
    if (message.includes('Passwords do not match')) 
        return 'As senhas digitadas não são iguais.';
    return message || 'Não foi possível concluir a operação.';
}

async function loadData() {
    $('list').innerHTML = '<tr><td colspan="6" class="loading-state">Carregando seus dados...</td></tr>';
    const [classResult, studentResult] = await Promise.all([
        db
            .from('classes')
            .select('*')
            .order('created_at'),
        db
            .from('students')
            .select('*')
            .order('created_at', {ascending: false})
    ]);
    if (classResult.error || studentResult.error) 
        throw classResult.error || studentResult.error;
    classes = classResult
        .data
        .map(fromClass);
    couples = studentResult
        .data
        .map(fromStudent);
    await migrateLocalData();
    render();
}

async function migrateLocalData() {
    const flag = `arteNativaMigrated_${currentUser.id}`;
    if (localStorage.getItem(flag)) 
        return;
    const oldClasses = JSON.parse(localStorage.getItem(LOCAL_CLASSES_KEY) || '[]');
    const oldCouples = JSON.parse(localStorage.getItem(LOCAL_COUPLES_KEY) || '[]');
    if (!oldClasses.length && !oldCouples.length) {
        localStorage.setItem(flag, 'true');
        return;
    }
    if (!confirm(`Encontramos ${oldCouples.length} cadastro(s) neste aparelho. Deseja enviá-los para sua conta online?`)) 
        return;
    const classMap = {};
    for (const item of oldClasses) {
        const {data, error} = await db
            .from('classes')
            .insert({
                name: item.name,
                place: item.place || '',
                schedule: item.schedule || ''
            })
            .select()
            .single();
        if (error) 
            throw error;
        classMap[item.id] = data.id;
    }
    if (oldCouples.length) {
        const rows = oldCouples.map(c => ({
            person1: c.person1,
            person2: c.person2 || null,
            class_id: classMap[c.classId] || null,
            entry_paid: Boolean(c.entry),
            payments: normalizePayments(c.payments || {
                person1: c.months,
                person2: c.person2
                    ? c.months
                    : null
            })
        }));
        const {error} = await db
            .from('students')
            .insert(rows);
        if (error) 
            throw error;
        }
    localStorage.setItem(flag, 'true');
    toast('Dados antigos enviados para sua conta.');
    const [cr, sr] = await Promise.all([
        db
            .from('classes')
            .select('*')
            .order('created_at'),
        db
            .from('students')
            .select('*')
            .order('created_at', {ascending: false})
    ]);
    classes = cr
        .data
        .map(fromClass);
    couples = sr
        .data
        .map(fromStudent);
}

function stats(items = couples) {
    const paid = items.reduce(
        (n, c) => n + c.payments.person1.filter(Boolean).length + (
            c.person2
                ? c.payments.person2.filter(Boolean).length
                : 0
        ),
        0
    );
    $('statTotal').textContent = items.length;
    $('statEntries').textContent = items.reduce((total, c) => total + Number(c.entryPayments.person1) + Number(Boolean(c.person2) && c.entryPayments.person2), 0);
    $('statPayments').textContent = paid;
    $('statClasses').textContent = classes.length;
}
function financialValues(c) {
    let entries = c.entryPayments.person1 ? c.fees.person1.entry : 0;
    let monthly = c.payments.person1.filter(Boolean).length * c.fees.person1.monthly;
    let count = Number(c.entryPayments.person1) + c.payments.person1.filter(Boolean).length;
    if (c.person2) {
        entries += c.entryPayments.person2 ? c.fees.person2.entry : 0;
        monthly += c.payments.person2.filter(Boolean).length * c.fees.person2.monthly;
        count += Number(c.entryPayments.person2) + c.payments.person2.filter(Boolean).length;
    }
    return {entries, monthly, total: entries + monthly, count};
}
function renderFinancial() {
    const filter = $('financialClassFilter').value;
    const items = couples.filter(c => filter === 'all' || (filter === 'none' ? !c.classId : c.classId === filter));
    const summary = items.reduce((acc, c) => {
        const values = financialValues(c);
        acc.entries += values.entries;
        acc.monthly += values.monthly;
        acc.count += values.count;
        return acc;
    }, {entries: 0, monthly: 0, count: 0});
    $('financialTotal').textContent = money(summary.entries + summary.monthly);
    $('financialEntries').textContent = money(summary.entries);
    $('financialMonthly').textContent = money(summary.monthly);
    $('financialPayments').textContent = summary.count;

    const groups = new Map();
    items.forEach(c => {
        const key = c.classId || 'none';
        const current = groups.get(key) || {students: 0, entries: 0, monthly: 0};
        const values = financialValues(c);
        current.students += c.person2 ? 2 : 1;
        current.entries += values.entries;
        current.monthly += values.monthly;
        groups.set(key, current);
    });
    $('financialList').innerHTML = groups.size ? [...groups.entries()].map(([id, values]) => {
        const classItem = classById(id);
        return `<tr><td><span class="class-name">${classItem ? escapeHtml(classItem.name) : 'Sem turma'}</span></td><td>${values.students}</td><td>${money(values.entries)}</td><td>${money(values.monthly)}</td><td class="financial-total-cell">${money(values.entries + values.monthly)}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty"><b>Nenhum valor recebido</b>Marque pagamentos como recebidos para exibi-los aqui.</td></tr>';
}
const classById = id => classes.find(item => item.id === id);
const safeFileName = value => String(value || 'turma')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'turma';

async function exportSelectedClass() {
    const classId = $('classFilter').value;
    const classItem = classById(classId);

    if (!classItem) {
        toast('Selecione uma turma para gerar a lista.');
        return;
    }

    const classCouples = couples
        .filter(c => c.classId === classId)
        .sort((a, b) => a.person1.localeCompare(b.person1, 'pt-BR'));

    if (!classCouples.length) {
        toast('Esta turma ainda não possui alunos.');
        return;
    }

    if (!window.docx) {
        toast('Não foi possível carregar o gerador de Word.');
        return;
    }

    const button = $('exportClassBtn');
    setLoading(button, true, 'Gerando...');

    try {
        const {Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel} = window.docx;
        const details = [];
        if (classItem.place) details.push(`Local: ${classItem.place}`);
        if (classItem.schedule) details.push(`Dia e horário: ${classItem.schedule}`);

        const children = [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                heading: HeadingLevel.TITLE,
                spacing: {after: 120},
                children: [new TextRun({text: classItem.name, bold: true})]
            }),
            ...details.map(detail => new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: {after: 80},
                children: [new TextRun({text: detail, bold: true, size: 24})]
            })),
            new Paragraph({spacing: {after: 260}}),
            ...classCouples.map((couple, index) => new Paragraph({
                spacing: {after: 220, line: 360},
                children: [
                    new TextRun({text: `${index + 1}. ${couple.person1} e `, size: 24}),
                    new TextRun({
                        text: couple.person2 || '__________________________________',
                        size: 24
                    })
                ]
            }))
        ];

        const documentFile = new Document({
            sections: [{
                properties: {},
                children
            }]
        });
        const blob = await Packer.toBlob(documentFile);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lista-${safeFileName(classItem.name)}.docx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Lista da turma gerada!');
    } catch (error) {
        console.error(error);
        toast('Não foi possível gerar a lista.');
    } finally {
        setLoading(button, false, '');
    }
}
function renderClassOptions() {
    const filter = $('classFilter').value,
        financialFilter = $('financialClassFilter').value,
        selected = $('coupleClass').value;
    const options = classes
        .map(
            item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`
        )
        .join('');
    $('classFilter').innerHTML = `<option value="all">Todas as turmas</option><option value="none">Sem turma</option>${options}`;
    $('financialClassFilter').innerHTML = `<option value="all">Todas as turmas</option><option value="none">Sem turma</option>${options}`;
    $('coupleClass').innerHTML = `<option value="">Sem turma</option>${options}`;
    if ([...$('classFilter').options].some(o => o.value === filter)) 
        $('classFilter').value = filter;
    if ([...$('financialClassFilter').options].some(o => o.value === financialFilter))
        $('financialClassFilter').value = financialFilter;
    if ([...$('coupleClass').options].some(o => o.value === selected)) 
        $('coupleClass').value = selected;
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
                )} • ${total} cadastro(s)</small></div><button type="button" class="icon-btn" data-delete-class="${item.id}">⌫</button></div>`;
            })
            .join('')
        : '<div class="empty"><b>Nenhuma turma criada</b>Cadastre a primeira turma.</div>';
}
function render() {
    renderClassOptions();
    const q = $('search')
            .value
            .toLowerCase()
            .trim(),
        filter = $('classFilter').value;
    const classFiltered = couples.filter(c => filter === 'all' || (
        filter === 'none'
            ? !c.classId
            : c.classId === filter
    ));

    const filtered = classFiltered.filter(
        c => `${c.person1} ${c.person2 || ''}`.toLowerCase().includes(q)
    );
    $('list').innerHTML = filtered.length
        ? filtered
            .map(c => {
                const paid1 = c
                        .payments
                        .person1
                        .filter(Boolean)
                        .length,
                    paid2 = c.person2
                        ? c
                            .payments
                            .person2
                            .filter(Boolean)
                            .length
                        : 0,
                    classItem = classById(c.classId);
                const personButtons = (person, name) => `<div class="person-payment"><span class="person-payment-name">${escapeHtml(
                    name
                )}</span><div class="payments">${c
                    .payments[person]
                    .map(
                        (on, i) => `<button class="month ${on
                            ? 'on'
                            : ''}" onclick="toggleMonth('${c.id}','${person}',${i})">${on
                                ? '✓'
                                : i + 1}</button>`
                    )
                    .join('')}</div></div>`;
                const entryButtons = `<div class="person-payment"><span class="person-payment-name">${escapeHtml(c.person1)}</span><button class="pill ${c.entryPayments.person1 ? 'paid' : 'pending'}" onclick="toggleEntry('${c.id}','person1')">${c.entryPayments.person1 ? 'Paga' : 'Pendente'}</button></div>${c.person2 ? `<div class="person-payment"><span class="person-payment-name">${escapeHtml(c.person2)}</span><button class="pill ${c.entryPayments.person2 ? 'paid' : 'pending'}" onclick="toggleEntry('${c.id}','person2')">${c.entryPayments.person2 ? 'Paga' : 'Pendente'}</button></div>` : ''}`;
                return `<tr><td class="couple"><strong>${escapeHtml(c.person1)}${c.person2
                    ? ` &amp; ${escapeHtml(c.person2)}`
                    : ''}</strong><small>${c.person2
                        ? 'Casal'
                        : 'Aluno individual'} • ${c.createdAt}</small></td><td><span class="class-name">${classItem
                            ? escapeHtml(classItem.name)
                            : 'Sem turma'}</span></td><td>${entryButtons}</td><td>${personButtons('person1', c.person1)}${c.person2
                                        ? personButtons('person2', c.person2)
                                        : ''}</td><td class="count"><b>${paid1 + paid2} de ${c.person2
                                            ? 6
                                            : 3}</b> pagas</td><td><div class="actions"><button class="icon-btn" onclick="editCouple('${c.id}')">✎</button><button class="icon-btn" onclick="removeCouple('${c.id}')">⌫</button></div></td></tr>`;
            })
            .join('')
        : '<tr><td colspan="6" class="empty"><b>Nenhum cadastro encontrado</b>Cadastre um' +
                ' aluno ou altere os filtros.</td></tr>';
    stats(classFiltered);
    renderFinancial();
}

function openNew() {
    $('form').reset();
    $('editingId').value = '';
    $('modalTitle').textContent = 'Cadastrar aluno ou casal';
    renderClassOptions();
    updatePerson2Fields();
    $('modal').showModal();
    $('person1').focus();
}
function editCouple(id) {
    const c = couples.find(x => x.id === id);
    if (!c) 
        return;
    $('editingId').value = id;
    $('person1').value = c.person1;
    $('person2').value = c.person2 || '';
    $('coupleClass').value = c.classId || '';
    $('p1Entry').checked = c.entryPayments.person1;
    $('p2Entry').checked = c.entryPayments.person2;
    $('p1EntryValue').value = c.fees.person1.entry || '';
    $('p1MonthlyValue').value = c.fees.person1.monthly || '';
    $('p2EntryValue').value = c.fees.person2.entry || '';
    $('p2MonthlyValue').value = c.fees.person2.monthly || '';
    c
        .payments
        .person1
        .forEach((v, i) => $('p1m' + (
            i + 1
        )).checked = v);
    c
        .payments
        .person2
        .forEach((v, i) => $('p2m' + (
            i + 1
        )).checked = v);
    $('modalTitle').textContent = 'Editar cadastro';
    updatePerson2Fields();
    $('modal').showModal();
}
async function toggleEntry(id, person) {
    const c = couples.find(x => x.id === id),
        entryPayments = {...c.entryPayments, [person]: !c.entryPayments[person]};
    const {error} = await db
        .from('students')
        .update({entry_payments: entryPayments, entry_paid: entryPayments.person1 || entryPayments.person2})
        .eq('id', id);
    if (error) 
        return toast('Erro ao atualizar.');
    c.entryPayments = entryPayments;
    render();
}
function updatePerson2Fields() {
    $('person2Payments').hidden = !$('person2').value.trim();
}
function setView(view) {
    activeView = view;
    $('studentsView').hidden = view !== 'students';
    $('financialView').hidden = view !== 'financial';
    $('studentsTab').classList.toggle('active', view === 'students');
    $('financialTab').classList.toggle('active', view === 'financial');
    if (view === 'financial') renderFinancial();
}
async function toggleMonth(id, person, index) {
    const c = couples.find(x => x.id === id),
        payments = structuredClone(c.payments);
    payments[person][index] = !payments[person][index];
    const {error} = await db
        .from('students')
        .update({payments})
        .eq('id', id);
    if (error) 
        return toast('Erro ao atualizar.');
    c.payments = payments;
    render();
}
async function removeCouple(id) {
    const c = couples.find(x => x.id === id);
    if (!c || !confirm(
        `Excluir o cadastro de ${c.person1}${c.person2
            ? ` e ${c.person2}`
            : ''}?`
    )) 
        return;
    const {error} = await db
        .from('students')
        .delete()
        .eq('id', id);
    if (error) 
        return toast('Erro ao excluir.');
    couples = couples.filter(x => x.id !== id);
    render();
    toast('Cadastro excluído.');
}
async function removeClass(id) {
    const item = classById(id);
    if (!item || !confirm(`Excluir a turma “${item.name}”?`)) 
        return;
    const {error} = await db
        .from('classes')
        .delete()
        .eq('id', id);
    if (error) 
        return toast('Erro ao excluir turma.');
    classes = classes.filter(x => x.id !== id);
    couples.forEach(c => {
        if (c.classId === id) 
            c.classId = '';
        }
    );
    render();
    renderClassList();
}

$('authForm').addEventListener('submit', handleAuth);
$('toggleAuthMode').onclick = () => setAuthMode(
    authMode === 'register'
        ? 'login'
        : 'register'
);
$('forgotPassword').onclick = () => setAuthMode('reset');
$('logoutBtn').onclick = () => db
    .auth
    .signOut();
$('form').addEventListener('submit', async event => {
    event.preventDefault();
    const id = $('editingId').value,
        person2 = $('person2')
            .value
            .trim();
    const payload = {
        person1: $('person1')
            .value
            .trim(),
        person2: person2 || null,
        class_id: $('coupleClass').value || null,
        entry_paid: $('p1Entry').checked || (person2 && $('p2Entry').checked),
        entry_payments: {
            person1: $('p1Entry').checked,
            person2: person2 ? $('p2Entry').checked : false
        },
        fees: {
            person1: {entry: inputMoney('p1EntryValue'), monthly: inputMoney('p1MonthlyValue')},
            person2: person2 ? {entry: inputMoney('p2EntryValue'), monthly: inputMoney('p2MonthlyValue')} : {entry: 0, monthly: 0}
        },
        payments: {
            person1: [1, 2, 3].map(i => $('p1m' + i).checked),
            person2: person2
                ? [1, 2, 3].map(i => $('p2m' + i).checked)
                : [false, false, false]
        }
    };
    const result = id
        ? await db
            .from('students')
            .update(payload)
            .eq('id', id)
            .select()
            .single()
        : await db
            .from('students')
            .insert(payload)
            .select()
            .single();
    if (result.error) 
        return toast('Não foi possível salvar.');
    const mapped = fromStudent(result.data);
    if (id) 
        couples = couples.map(
            c => c.id === id
                ? mapped
                : c
        );
    else 
        couples.unshift(mapped);
    $('modal').close();
    render();
    toast('Cadastro salvo!');
});
$('classForm').addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
        name: $('className')
            .value
            .trim(),
        place: $('classPlace')
            .value
            .trim(),
        schedule: $('classSchedule')
            .value
            .trim()
    };
    const {data, error} = await db
        .from('classes')
        .insert(payload)
        .select()
        .single();
    if (error) 
        return toast('Não foi possível criar a turma.');
    classes.push(fromClass(data));
    $('classForm').reset();
    render();
    renderClassList();
    toast('Turma criada!');
});
$('newBtn').onclick = openNew;
$('newClassBtn').onclick = () => {
    $('classForm').reset();
    renderClassList();
    $('classModal').showModal();
};
$('closeBtn').onclick = () => $('modal').close();
$('cancelBtn').onclick = () => $('modal').close();
$('closeClassBtn').onclick = () => $('classModal').close();
$('cancelClassBtn').onclick = () => $('classModal').close();
$('search').oninput = render;
$('classFilter').onchange = render;
$('exportClassBtn').onclick = exportSelectedClass;
$('financialClassFilter').onchange = renderFinancial;
$('studentsTab').onclick = () => setView('students');
$('financialTab').onclick = () => setView('financial');
$('person2').oninput = updatePerson2Fields;
$('classList').addEventListener('click', event => {
    const button = event
        .target
        .closest('[data-delete-class]');
    if (button) 
        removeClass(button.dataset.deleteClass);
    }
);

db.auth
    .onAuthStateChange(async (event, session) => {
        currentUser = session
            ?.user || null;

        if (event === 'PASSWORD_RECOVERY') {
            recoverySession = session;
            currentUser = session
                ?.user || null;

            showAuth();
            setAuthMode('update-password');
            return;
        }

        if (!currentUser) {
            showAuth();
            couples = [];
            classes = [];
            return;
        }

        showApp();

        try {
            await loadData();
        } catch (error) {
            console.error(error);
            toast(
                error.message.includes('does not exist')
                    ? 'Configure o banco com o arquivo supabase-schema.sql.'
                    : 'Erro ao carregar dados.'
            );
        }
    });

setAuthMode('login');
