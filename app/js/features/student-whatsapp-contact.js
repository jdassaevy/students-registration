(function (root) {
  function normalizePhone(value) {
    if (value == null) return null;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return null;
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return null;
  }

  function resolveConsentTimestamp(previousConsent, nextConsent, previousTimestamp, nowIso = new Date().toISOString()) {
    if (!nextConsent) return null;
    if (previousConsent && previousTimestamp) return previousTimestamp;
    return nowIso;
  }

  const api = { normalizePhone, resolveConsentTimestamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StudentWhatsappContact = api;

  if (!root.document) return;

  const byId = id => document.getElementById(id);

  function injectStyles() {
    if (byId('studentWhatsappContactStyles')) return;
    const style = document.createElement('style');
    style.id = 'studentWhatsappContactStyles';
    style.textContent = `
      .whatsapp-contact-block { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(91,33,24,.10); }
      .whatsapp-contact-block .field { margin-bottom: 10px; }
      .whatsapp-consent { display:flex; gap:10px; align-items:flex-start; font-size:.9rem; line-height:1.4; cursor:pointer; }
      .whatsapp-consent input { margin-top:3px; flex:0 0 auto; }
      .whatsapp-consent input:disabled + span { opacity:.55; }
      .field-hint { display:block; margin-top:6px; opacity:.7; font-size:.78rem; line-height:1.35; }
    `;
    document.head.appendChild(style);
  }

  function contactMarkup(person) {
    const label = person === 'person1' ? 'primeira pessoa' : 'segunda pessoa';
    const prefix = person === 'person1' ? 'p1' : 'p2';
    return `
      <div class="whatsapp-contact-block" data-whatsapp-contact="${person}">
        <div class="field">
          <label for="${prefix}Phone">WhatsApp da ${label} (opcional)</label>
          <input id="${prefix}Phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex.: (48) 99999-9999">
          <small class="field-hint">O cadastro pode ser salvo normalmente sem telefone.</small>
        </div>
        <label class="whatsapp-consent">
          <input id="${prefix}WhatsappConsent" type="checkbox">
          <span>Aluno autorizou o recebimento de lembretes, confirmações de pagamento e recibos pelo WhatsApp.</span>
        </label>
      </div>`;
  }

  function syncConsent(phoneId, consentId) {
    const phone = byId(phoneId);
    const consent = byId(consentId);
    if (!phone || !consent) return;
    const hasValue = Boolean(phone.value.trim());
    consent.disabled = !hasValue;
    if (!hasValue) consent.checked = false;
  }

  function injectStudentContactFields() {
    if (byId('p1Phone')) return;
    const p1Block = byId('p1EntryValue')?.closest('.financial-person-block');
    const p2Block = byId('p2EntryValue')?.closest('.financial-person-block');
    if (p1Block) p1Block.insertAdjacentHTML('beforeend', contactMarkup('person1'));
    if (p2Block) p2Block.insertAdjacentHTML('beforeend', contactMarkup('person2'));

    [['p1Phone', 'p1WhatsappConsent'], ['p2Phone', 'p2WhatsappConsent']].forEach(([phoneId, consentId]) => {
      const phone = byId(phoneId);
      if (!phone) return;
      phone.addEventListener('input', () => syncConsent(phoneId, consentId));
      syncConsent(phoneId, consentId);
    });
  }

  function clearContactFields() {
    ['p1Phone', 'p2Phone'].forEach(id => { if (byId(id)) byId(id).value = ''; });
    ['p1WhatsappConsent', 'p2WhatsappConsent'].forEach(id => {
      if (!byId(id)) return;
      byId(id).checked = false;
      byId(id).disabled = true;
    });
  }

  async function populateStudentContactFields(id) {
    clearContactFields();
    if (!id) return;
    const { data, error } = await db
      .from('students')
      .select('person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent')
      .eq('id', id)
      .single();
    if (error) {
      console.error(error);
      return;
    }
    byId('p1Phone').value = data.person1_phone || '';
    byId('p2Phone').value = data.person2_phone || '';
    byId('p1WhatsappConsent').checked = Boolean(data.person1_phone && data.person1_whatsapp_consent);
    byId('p2WhatsappConsent').checked = Boolean(data.person2_phone && data.person2_whatsapp_consent);
    syncConsent('p1Phone', 'p1WhatsappConsent');
    syncConsent('p2Phone', 'p2WhatsappConsent');
  }

  async function saveStudentWithWhatsappConsent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const id = byId('editingId').value;
    const person2 = byId('person2').value.trim();
    const p1Raw = byId('p1Phone').value.trim();
    const p2Raw = byId('p2Phone').value.trim();
    const p1Phone = normalizePhone(p1Raw);
    const p2Phone = person2 ? normalizePhone(p2Raw) : null;

    if ((p1Raw && !p1Phone) || (person2 && p2Raw && !p2Phone)) {
      toast('Confira o WhatsApp informado. Use DDD + número.');
      return;
    }

    const previousStudent = id
      ? structuredClone(couples.find(student => student.id === id) || null)
      : null;
    const previous = id
      ? await db.from('students')
          .select('person1_whatsapp_consent,person2_whatsapp_consent,person1_whatsapp_consent_at,person2_whatsapp_consent_at')
          .eq('id', id)
          .single()
      : { data: null, error: null };

    if (previous.error) {
      console.error(previous.error);
      toast('Não foi possível validar o consentimento atual.');
      return;
    }

    const p1Consent = Boolean(p1Phone && byId('p1WhatsappConsent').checked);
    const p2Consent = Boolean(person2 && p2Phone && byId('p2WhatsappConsent').checked);
    const nowIso = new Date().toISOString();
    const old = previous.data || {};

    const payload = {
      person1: byId('person1').value.trim(),
      person2: person2 || null,
      class_id: byId('coupleClass').value || null,
      entry_paid: byId('p1Entry').checked || Boolean(person2 && byId('p2Entry').checked),
      entry_payments: {
        person1: byId('p1Entry').checked,
        person2: person2 ? byId('p2Entry').checked : false
      },
      fees: {
        person1: { entry: inputMoney('p1EntryValue'), monthly: inputMoney('p1MonthlyValue') },
        person2: person2
          ? { entry: inputMoney('p2EntryValue'), monthly: inputMoney('p2MonthlyValue') }
          : { entry: 0, monthly: 0 }
      },
      payments: {
        person1: [1, 2, 3].map(i => byId(`p1m${i}`).checked),
        person2: person2 ? [1, 2, 3].map(i => byId(`p2m${i}`).checked) : [false, false, false]
      },
      person1_phone: p1Phone,
      person2_phone: p2Phone,
      person1_whatsapp_consent: p1Consent,
      person2_whatsapp_consent: p2Consent,
      person1_whatsapp_consent_at: resolveConsentTimestamp(
        Boolean(old.person1_whatsapp_consent), p1Consent, old.person1_whatsapp_consent_at, nowIso
      ),
      person2_whatsapp_consent_at: resolveConsentTimestamp(
        Boolean(old.person2_whatsapp_consent), p2Consent, old.person2_whatsapp_consent_at, nowIso
      )
    };

    const result = id
      ? await db.from('students').update(payload).eq('id', id).select().single()
      : await db.from('students').insert(payload).select().single();

    if (result.error) {
      console.error(result.error);
      toast('Não foi possível salvar.');
      return;
    }

    const mapped = {
      ...fromStudent(result.data),
      person1Phone: result.data.person1_phone || '',
      person2Phone: result.data.person2_phone || '',
      person1WhatsappConsent: Boolean(result.data.person1_whatsapp_consent),
      person2WhatsappConsent: Boolean(result.data.person2_whatsapp_consent)
    };
    if (id) couples = couples.map(couple => couple.id === id ? mapped : couple);
    else couples.unshift(mapped);

    closeDialog(byId('modal'));
    render();
    toast('Cadastro salvo!');
    if (root.PaymentAutomation?.processSavedStudent) {
      void root.PaymentAutomation.processSavedStudent(previousStudent, mapped);
    }
  }

  function wireUi() {
    injectStyles();
    injectStudentContactFields();

    byId('newBtn')?.addEventListener('click', () => {
      clearContactFields();
      syncConsent('p1Phone', 'p1WhatsappConsent');
      syncConsent('p2Phone', 'p2WhatsappConsent');
    });

    if (typeof root.editCouple === 'function') {
      const originalEditCouple = root.editCouple;
      root.editCouple = function (id) {
        originalEditCouple(id);
        void populateStudentContactFields(id);
      };
    }

    byId('form')?.addEventListener('submit', saveStudentWithWhatsappConsent, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUi, { once: true });
  else wireUi();
})(typeof window !== 'undefined' ? window : globalThis);
