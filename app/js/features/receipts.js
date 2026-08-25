(function (root) {
  function paymentLabel({ kind, installment = 0 } = {}) {
    if (kind === 'entry') return 'Inscrição';
    if (kind === 'monthly' && installment >= 1 && installment <= 3) return `${installment}ª Mensalidade`;
    return 'Pagamento';
  }

  function receiptStatusLabel(status) {
    return status === 'voided' ? 'Estornado' : 'Ativo';
  }

  function canVoidReceipt(receipt) {
    return Boolean(receipt && receipt.status === 'active');
  }

  function buildReceiptIdentity({ studentId, person, kind, installment = 0 } = {}) {
    return [studentId || '', person || '', kind || '', Number(installment) || 0].join(':');
  }

  const client = typeof db !== 'undefined' ? db : root.db;
  const api = {
    items: [],
    paymentLabel,
    receiptStatusLabel,
    canVoidReceipt,
    buildReceiptIdentity,
    async load() {
      if (!client) return [];
      const { data, error } = await client
        .from('receipts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Recibos ainda não configurados:', error.message);
        api.items = [];
        renderHistory();
        return [];
      }
      api.items = data || [];
      renderHistory();
      root.dispatchEvent?.(new CustomEvent('receipts:loaded', { detail: api.items }));
      return api.items;
    },
    forStudent(studentId) {
      return api.items.filter(item => item.student_id === studentId);
    },
    forPayment(studentId, person, kind, installment = 0) {
      return api.items.filter(item =>
        item.student_id === studentId &&
        item.person === person &&
        item.kind === kind &&
        Number(item.installment || 0) === Number(installment || 0)
      );
    },
    activeForPayment(studentId, person, kind, installment = 0) {
      return api.forPayment(studentId, person, kind, installment)
        .find(item => item.status === 'active') || null;
    },
    async open(receipt) {
      if (!receipt?.storage_path || !client) return false;
      const { data, error } = await client.storage
        .from('receipts')
        .createSignedUrl(receipt.storage_path, 60);
      if (error || !data?.signedUrl) return false;
      root.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      return true;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { paymentLabel, receiptStatusLabel, canVoidReceipt, buildReceiptIdentity };
  }

  root.Receipts = api;
  if (!root.document) return;
  const document = root.document;
  const moneyText = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureHistoryPanel() {
    const financialView = document.getElementById('financialView');
    if (!financialView || document.getElementById('receiptHistoryPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'receiptHistoryPanel';
    panel.className = 'panel';
    panel.style.marginTop = '18px';
    panel.innerHTML = `<div style="padding:20px 22px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px"><div><small style="color:var(--terracotta);font-weight:850;text-transform:uppercase;letter-spacing:.08em">Auditoria</small><h3 style="margin:4px 0 0;color:var(--wine-dark);font-family:Georgia,serif">Histórico de recibos</h3><p style="margin:5px 0 0;color:var(--muted);font-size:12px">Recibos emitidos permanecem registrados mesmo após estorno.</p></div><button type="button" class="btn btn-light" id="refreshReceiptsBtn">↻ Atualizar</button></div><div id="receiptHistoryList"></div></div>`;
    financialView.appendChild(panel);
    document.getElementById('refreshReceiptsBtn').onclick = () => api.load();
    panel.addEventListener('click', async event => {
      const button = event.target.closest('[data-open-receipt]');
      if (!button) return;
      const receipt = api.items.find(item => item.id === button.dataset.openReceipt);
      if (!receipt) return;
      const opened = await api.open(receipt);
      if (!opened && typeof toast === 'function') toast('PDF do recibo ainda não disponível.');
    });
  }

  function renderHistory() {
    ensureHistoryPanel();
    const list = document.getElementById('receiptHistoryList');
    if (!list) return;
    if (!api.items.length) {
      list.innerHTML = '<div class="empty"><b>Nenhum recibo emitido ainda</b>Os recibos aparecerão aqui quando a automação de pagamentos for ativada.</div>';
      return;
    }
    list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Recibo</th><th>Referente</th><th>Valor</th><th>Data</th><th>Status</th><th>PDF</th></tr></thead><tbody>${api.items.map(item => {
      const status = receiptStatusLabel(item.status);
      const date = item.paid_at ? new Date(item.paid_at).toLocaleString('pt-BR') : '—';
      return `<tr><td><strong>${escape(item.receipt_number)}</strong></td><td>${escape(paymentLabel(item))}</td><td>${moneyText(item.amount)}</td><td>${escape(date)}</td><td><span class="pill ${item.status === 'voided' ? 'pending' : 'paid'}">${status}</span></td><td>${item.storage_path ? `<button type="button" class="btn btn-light" data-open-receipt="${item.id}">Visualizar</button>` : '<span style="color:var(--muted);font-size:11px">PDF pendente</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { ensureHistoryPanel(); api.load(); }, { once: true });
  } else {
    ensureHistoryPanel();
    api.load();
  }
})(typeof window !== 'undefined' ? window : globalThis);
