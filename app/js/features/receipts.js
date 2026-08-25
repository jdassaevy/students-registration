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
        return [];
      }
      api.items = data || [];
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
  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', () => api.load(), { once: true });
  } else {
    api.load();
  }
})(typeof window !== 'undefined' ? window : globalThis);
