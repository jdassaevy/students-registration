const db = window
    .supabase
    .createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey);
const LOCAL_COUPLES_KEY = 'arteNativaCasais_v1';
const LOCAL_CLASSES_KEY = 'arteNativaTurmas_v1';
const $ = id => document.getElementById(id);
let currentUser = null;
let couples = [];
let classes = [];
let authMode = 'login';

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
const fromStudent = row => ({
    id: row.id,
    person1: row.person1,
    person2: row.person2 || '',
    classId: row.class_id || '',
    entry: row.entry_paid,
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
            : 'Recuperar senha';
    $('authSubtitle').textContent = mode === 'register'
        ? 'Seus alunos e turmas ficarão separados das outras contas.'
        : mode === 'reset'
            ? 'Enviaremos um link de recuperação para seu e-mail.'
            : 'Acesse suas turmas e alunos em qualquer dispositivo.';
    $('authSubmit').textContent = mode === 'login'
        ? 'Entrar'
        : mode === 'register'
            ? 'Criar conta'
            : 'Enviar link';
    $('authSubmit').dataset.label = $('authSubmit').textContent;
    $('toggleAuthMode').textContent = mode === 'register'
        ? 'Já tenho uma conta'
        : 'Criar uma conta';
    $('forgotPassword').hidden = mode === 'reset';
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
        if (authMode === 'register') {
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

function stats() {
    const paid = couples.reduce(
        (n, c) => n + c.payments.person1.filter(Boolean).length + (
            c.person2
                ? c.payments.person2.filter(Boolean).length
                : 0
        ),
        0
    );
    $('statTotal').textContent = couples.length;
    $('statEntries').textContent = couples
        .filter(c => c.entry)
        .length;
    $('statPayments').textContent = paid;
    $('statClasses').textContent = classes.length;
}
const classById = id => classes.find(item => item.id === id);
function renderClassOptions() {
    const filter = $('classFilter').value,
        selected = $('coupleClass').value;
    const options = classes
        .map(
            item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`
        )
        .join('');
    $('classFilter').innerHTML = `<option value="all">Todas as turmas</option><option value="none">Sem turma</option>${options}`;
    $('coupleClass').innerHTML = `<option value="">Sem turma</option>${options}`;
    if ([...$('classFilter').options].some(o => o.value === filter)) 
        $('classFilter').value = filter;
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
    const filtered = couples.filter(
        c => (`${c.person1} ${c.person2 || ''}`).toLowerCase().includes(q) && (filter === 'all' || (
            filter === 'none'
                ? !c.classId
                : c.classId === filter
        ))
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
                return `<tr><td class="couple"><strong>${escapeHtml(c.person1)}${c.person2
                    ? ` &amp; ${escapeHtml(c.person2)}`
                    : ''}</strong><small>${c.person2
                        ? 'Casal'
                        : 'Aluno individual'} • ${c.createdAt}</small></td><td><span class="class-name">${classItem
                            ? escapeHtml(classItem.name)
                            : 'Sem turma'}</span></td><td><button class="pill ${c.entry
                                ? 'paid'
                                : 'pending'}" onclick="toggleEntry('${c.id}')">${c.entry
                                    ? 'Paga'
                                    : 'Pendente'}</button></td><td>${personButtons('person1', c.person1)}${c.person2
                                        ? personButtons('person2', c.person2)
                                        : ''}</td><td class="count"><b>${paid1 + paid2} de ${c.person2
                                            ? 6
                                            : 3}</b> pagas</td><td><div class="actions"><button class="icon-btn" onclick="editCouple('${c.id}')">✎</button><button class="icon-btn" onclick="removeCouple('${c.id}')">⌫</button></div></td></tr>`;
            })
            .join('')
        : '<tr><td colspan="6" class="empty"><b>Nenhum cadastro encontrado</b>Cadastre um' +
                ' aluno ou altere os filtros.</td></tr>';
    stats();
}

function openNew() {
    $('form').reset();
    $('editingId').value = '';
    $('modalTitle').textContent = 'Cadastrar aluno ou casal';
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
    $('person2').value = c.person2 || '';
    $('coupleClass').value = c.classId || '';
    $('entry').checked = c.entry;
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
    $('modal').showModal();
}
async function toggleEntry(id) {
    const c = couples.find(x => x.id === id),
        value = !c.entry;
    const {error} = await db
        .from('students')
        .update({entry_paid: value})
        .eq('id', id);
    if (error) 
        return toast('Erro ao atualizar.');
    c.entry = value;
    render();
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
        entry_paid: $('entry').checked,
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
$('classList').addEventListener('click', event => {
    const button = event
        .target
        .closest('[data-delete-class]');
    if (button) 
        removeClass(button.dataset.deleteClass);
    }
);

db
    .auth
    .onAuthStateChange(async (event, session) => {
        currentUser = session
            ?.user || null;
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
