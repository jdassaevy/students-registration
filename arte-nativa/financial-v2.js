(() => {
  let charges = [];
  let selected = null;
  const expanded = new Set();
  const view = document.getElementById('financialView');

  const css = document.createElement('style');
  css.textContent = `
    .fin2-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}
    .fin2-head h2{margin:0 0 5px;color:var(--wine-dark);font:700 30px Georgia,serif}
    .fin2-head p{margin:0;color:var(--muted)}
    .fin2-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
    .fin2-card{padding:18px 20px;border-radius:18px;background:var(--surface-glass,var(--paper));border:1px solid rgba(255,255,255,.76);box-shadow:var(--shadow);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
    .fin2-card span{display:block;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
    .fin2-card strong{display:block;margin-top:7px;color:var(--wine-dark);font-size:clamp(22px,2.5vw,30px);line-height:1.15}
    .fin2-card.featured{background:linear-gradient(135deg,var(--wine-dark),var(--wine));border-color:transparent}
    .fin2-card.featured span,.fin2-card.featured strong{color:white}
    .fin2-card.danger strong{color:var(--red)}
    .fin2-toolbar{padding:18px 20px;display:grid;grid-template-columns:minmax(220px,1.6fr) minmax(170px,.8fr) minmax(170px,.8fr);gap:12px;align-items:center;border-bottom:1px solid var(--line)}
    .fin2-toolbar .search{min-width:0;max-width:none}
    .fin2-toolbar .search input{width:100%}
    .fin2-filter{width:100%;height:44px;padding:0 34px 0 12px;border:1px solid var(--line);border-radius:11px;background:white;color:var(--ink);font:inherit}

    .fpeople{display:grid;gap:12px;padding:14px}
    .fperson{border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.76);overflow:hidden;transition:box-shadow .28s ease,border-color .28s ease,transform .28s ease}
    .fperson.open{border-color:rgba(105,43,31,.20);box-shadow:0 10px 28px rgba(74,38,28,.08)}
    .fhead{position:relative;width:100%;border:0;background:transparent;padding:17px 52px 17px 20px;display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(110px,.8fr) minmax(110px,.8fr) minmax(170px,1fr) auto;gap:16px;align-items:center;text-align:left;cursor:pointer;color:var(--ink);transition:background .22s ease}
    .fhead:hover{background:rgba(255,255,255,.62)}
    .fhead::after{content:'›';position:absolute;right:20px;top:50%;font-size:24px;color:var(--wine);transform:translateY(-50%) rotate(0deg);transition:transform .32s cubic-bezier(.2,.8,.2,1)}
    .fperson.open .fhead::after{transform:translateY(-50%) rotate(90deg)}
    .fhead small,.fcharge small{display:block;color:var(--muted);margin-top:3px}
    .fstatus{display:inline-flex;align-items:center;justify-content:center;padding:7px 10px;border-radius:999px;font-size:11px;font-weight:850;white-space:nowrap}
    .fpaid{color:var(--green);background:#e6f4ec}
    .fpending{color:#946716;background:#fff5d8}
    .foverdue{color:var(--red);background:#fbeae7}
    .fprogress{height:6px;background:#eadfd6;border-radius:999px;overflow:hidden;margin-top:7px}
    .fprogress i{display:block;height:100%;background:var(--wine);border-radius:inherit;transition:width .35s ease}

    .fdetail{display:grid;grid-template-rows:0fr;opacity:0;border-top:1px solid transparent;transition:grid-template-rows .38s cubic-bezier(.2,.8,.2,1),opacity .26s ease,border-color .25s ease}
    .fdetail-inner{min-height:0;overflow:hidden;padding:0 18px;transition:padding .38s cubic-bezier(.2,.8,.2,1)}
    .fperson.open .fdetail{grid-template-rows:1fr;opacity:1;border-top-color:var(--line)}
    .fperson.open .fdetail-inner{padding:8px 18px 18px}
    .fcharge{display:grid;grid-template-columns:minmax(180px,1.5fr) .7fr .9fr .9fr auto;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(120,80,60,.10)}
    .fcharge:last-child{border-bottom:0}
    .flink{border:0;background:transparent;color:var(--wine);font-weight:800;cursor:pointer;padding:7px 8px;border-radius:8px;transition:background .2s ease}
    .flink:hover{background:rgba(105,43,31,.08)}
    .fempty{padding:45px;text-align:center;color:var(--muted)}

    @media(max-width:950px){
      .fin2-stats{grid-template-columns:1fr 1fr}
      .fin2-toolbar{grid-template-columns:1fr 1fr}
      .fin2-toolbar .search{grid-column:1/-1}
      .fhead{grid-template-columns:1.2fr .8fr .8fr}
      .fhead>div:nth-child(4){grid-column:2/4}
      .fcharge{grid-template-columns:1.2fr .7fr .8fr}
    }
    @media(max-width:620px){
      .fin2-head{align-items:stretch;flex-direction:column}
      .fin2-head .btn{width:100%}
      .fin2-stats{grid-template-columns:1fr}
      .fin2-toolbar{grid-template-columns:1fr}
      .fin2-toolbar .search{grid-column:auto}
      .fhead{grid-template-columns:1fr;padding:16px 50px 16px 16px;gap:10px}
      .fhead>div:nth-child(4){grid-column:auto}
      .fcharge{grid-template-columns:1fr;gap:7px;padding:14px 0}
    }
  `;
  document.head.appendChild(css);

  const today = () => new Date().toISOString().slice(0,10);
  const statusOf = c => c.status === 'paid' ? 'paid' : c.due_date && c.due_date < today() ? 'overdue' : 'pending';
  const statusLabel = s => s === 'paid' ? 'Pago' : s === 'overdue' ? 'Atrasado' : 'Pendente';
  const formatDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem vencimento';
  const studentById = id => couples.find(s => s.id === id);
  const personName = charge => {
    const student = studentById(charge.student_id);
    return charge.person_slot === 'person2' ? student?.person2 : student?.person1;
  };

  function setup() {
    view.innerHTML = `
      <div class="fin2-head">
        <div>
          <h2>Controle financeiro</h2>
          <p>Clique em um aluno para visualizar suas mensalidades e cobranças.</p>
        </div>
        <button class="btn btn-primary" id="fnova">＋ Nova cobrança</button>
      </div>
      <section class="fin2-stats">
        <article class="fin2-card featured"><span>Recebido</span><strong id="frecebido">R$ 0,00</strong></article>
        <article class="fin2-card"><span>A receber</span><strong id="freceber">R$ 0,00</strong></article>
        <article class="fin2-card danger"><span>Em atraso</span><strong id="fatraso">R$ 0,00</strong></article>
        <article class="fin2-card"><span>Alunos pendentes</span><strong id="fpendentes">0</strong></article>
      </section>
      <section class="panel">
        <div class="fin2-toolbar">
          <div class="search"><input id="fbusca" type="search" placeholder="Buscar aluno..."></div>
          <select id="financialClassFilter" class="fin2-filter"><option value="all">Todas as turmas</option></select>
          <select id="fstatus" class="fin2-filter">
            <option value="all">Todos os status</option>
            <option value="paid">Em dia</option>
            <option value="pending">Com pendências</option>
            <option value="overdue">Com atraso</option>
          </select>
        </div>
        <div class="fpeople" id="fpeople"></div>
      </section>`;

    document.getElementById('appView').insertAdjacentHTML('beforeend', `
      <dialog id="fpay">
        <div class="modal-head"><div><h2>Registrar pagamento</h2><p id="fpaysum"></p></div><button class="close" id="fpayx">×</button></div>
        <form id="fpayform">
          <div class="grid">
            <div class="field"><label>Valor recebido</label><input id="fvalor" type="number" step=".01" min="0" required></div>
            <div class="field"><label>Data</label><input id="fdata" type="date" required></div>
            <div class="field wide"><label>Forma</label><select id="fmetodo"><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select></div>
          </div>
          <div class="modal-actions"><button type="button" class="btn btn-light" id="fpaycancel">Cancelar</button><button class="btn btn-primary">Confirmar</button></div>
        </form>
      </dialog>`);

    $('fbusca').oninput = render;
    $('financialClassFilter').onchange = render;
    $('fstatus').onchange = render;
    $('fpeople').onclick = handleClick;
    $('fpayx').onclick = $('fpaycancel').onclick = () => closeDialog($('fpay'));
    $('fpayform').onsubmit = savePayment;
    $('fnova').onclick = () => toast('Use o cadastro do aluno para gerar mensalidades automaticamente.');
  }

  async function load() {
    if (!currentUser) return;
    const {data,error} = await db.from('financial_charges').select('*').order('installment_number');
    if (error) return toast('Erro ao carregar financeiro.');
    charges = data || [];
    render();
  }

  function render() {
    const classFilter = $('financialClassFilter');
    if (!classFilter) return;
    const currentClass = classFilter.value;
    classFilter.innerHTML = `<option value="all">Todas as turmas</option><option value="none">Sem turma</option>${classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}`;
    if ([...classFilter.options].some(o => o.value === currentClass)) classFilter.value = currentClass;

    const base = charges.filter(charge => {
      const student = studentById(charge.student_id);
      const classId = student?.classId || '';
      return classFilter.value === 'all' || (classFilter.value === 'none' ? !classId : classId === classFilter.value);
    });

    const open = base.filter(c => c.status === 'pending');
    const overdue = open.filter(c => statusOf(c) === 'overdue');
    const received = base.filter(c => c.status === 'paid').reduce((n,c) => n + Number(c.paid_amount ?? c.amount),0);
    $('frecebido').textContent = money(received);
    $('freceber').textContent = money(open.reduce((n,c) => n + Number(c.amount),0));
    $('fatraso').textContent = money(overdue.reduce((n,c) => n + Number(c.amount),0));
    $('fpendentes').textContent = new Set(open.map(c => `${c.student_id}|${c.person_slot}`)).size;

    const grouped = new Map();
    base.forEach(charge => {
      const key = `${charge.student_id}|${charge.person_slot}`;
      if (!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(charge);
    });

    const query = $('fbusca').value.toLowerCase().trim();
    const filter = $('fstatus').value;
    const groups = [...grouped].map(([key,items]) => {
      const student = studentById(items[0].student_id);
      const name = personName(items[0]) || 'Aluno removido';
      const classItem = student ? classById(student.classId) : null;
      const paid = items.filter(c => c.status === 'paid');
      const pending = items.filter(c => c.status === 'pending');
      const late = pending.filter(c => statusOf(c) === 'overdue');
      const state = late.length ? 'overdue' : pending.length ? 'pending' : 'paid';
      const total = items.reduce((n,c) => n + Number(c.amount),0);
      const received = paid.reduce((n,c) => n + Number(c.paid_amount ?? c.amount),0);
      return {key,items,name,classItem,paid,pending,late,state,total,received};
    }).filter(group => (!query || group.name.toLowerCase().includes(query)) && (filter === 'all' || group.state === filter));

    $('fpeople').innerHTML = groups.length ? groups.map(group => {
      const count = group.paid.length + group.pending.length;
      const percentage = group.total ? Math.min(100,Math.round(group.received / group.total * 100)) : 100;
      const stateText = group.state === 'paid' ? 'Em dia' : group.state === 'overdue' ? `${group.late.length} atrasada(s)` : `${group.pending.length} pendente(s)`;
      return `
        <article class="fperson ${expanded.has(group.key) ? 'open' : ''}" data-person-key="${group.key}">
          <button class="fhead" data-open="${group.key}">
            <div><strong>${escapeHtml(group.name)}</strong><small>${group.classItem ? escapeHtml(group.classItem.name) : 'Sem turma'}</small></div>
            <div><strong>${money(group.total)}</strong><small>Previsto</small></div>
            <div><strong>${money(group.received)}</strong><small>Recebido</small></div>
            <div><strong>${group.paid.length}/${count} pagos</strong><div class="fprogress"><i style="width:${percentage}%"></i></div></div>
            <span class="fstatus f${group.state}">${stateText}</span>
          </button>
          <div class="fdetail">
            <div class="fdetail-inner">
              ${group.items.map(charge => `
                <div class="fcharge">
                  <div><strong>${escapeHtml(charge.description || charge.competence || 'Cobrança')}</strong><small>${escapeHtml(charge.competence || '')}</small></div>
                  <strong>${money(charge.amount)}</strong>
                  <span>${formatDate(charge.due_date)}</span>
                  <span class="fstatus f${statusOf(charge)}">${statusLabel(statusOf(charge))}</span>
                  <div>${charge.status === 'pending' ? `<button class="flink" data-pay="${charge.id}">Receber</button>` : ''}</div>
                </div>`).join('')}
            </div>
          </div>
        </article>`;
    }).join('') : '<div class="fempty"><b>Nenhum aluno encontrado</b></div>';
  }

  function handleClick(event) {
    const toggle = event.target.closest('[data-open]');
    if (toggle) {
      const key = toggle.dataset.open;
      const card = toggle.closest('.fperson');
      const willOpen = !card.classList.contains('open');
      card.classList.toggle('open',willOpen);
      willOpen ? expanded.add(key) : expanded.delete(key);
      return;
    }

    const payButton = event.target.closest('[data-pay]');
    if (payButton) {
      selected = charges.find(c => c.id === payButton.dataset.pay);
      if (!selected) return;
      $('fvalor').value = selected.amount;
      $('fdata').value = today();
      $('fpaysum').textContent = `${personName(selected)} — ${selected.description || selected.competence}`;
      openDialog($('fpay'));
    }
  }

  async function savePayment(event) {
    event.preventDefault();
    const paymentDate = $('fdata').value;
    const {error} = await db.from('financial_charges').update({
      status:'paid',
      paid_amount:Number($('fvalor').value),
      paid_at:paymentDate + 'T12:00:00',
      payment_method:$('fmetodo').value
    }).eq('id',selected.id);
    if (error) return toast('Erro ao registrar pagamento.');
    closeDialog($('fpay'));
    await load();
    if (window.billingIntegration) await window.billingIntegration.reloadCharges();
    toast('Pagamento registrado!');
  }

  setup();
  window.addEventListener('financial-v2-refresh',load);
  window.addEventListener('billing-charges-updated',() => setTimeout(load,0));
  const previousSetView = setView;
  setView = function(viewName) {
    previousSetView(viewName);
    if (viewName === 'financial') load();
  };
  window.financialV2 = {reload:load};
})();