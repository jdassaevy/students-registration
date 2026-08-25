(function (root) {
  function normalizePhone(value) {
    if (value == null) return null;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return null;
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return null;
  }

  function isWhatsappEligible(phone, consent) {
    return Boolean(normalizePhone(phone) && consent);
  }

  function resolveConsentTimestamp(previousConsent, nextConsent, previousTimestamp, nowIso = new Date().toISOString()) {
    if (!nextConsent) return null;
    if (previousConsent && previousTimestamp) return previousTimestamp;
    return nowIso;
  }

  const api = { normalizePhone, isWhatsappEligible, resolveConsentTimestamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AcademyAutomationData = api;

  if (!root.document) return;

  const byId = id => document.getElementById(id);
  const escapeValue = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function injectStyles() {
    if (byId('academyAutomationStyles')) return;
    const style = document.createElement('style');
    style.id = 'academyAutomationStyles';
    style.textContent = `
      .whatsapp-contact-block { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(91,33,24,.10); }
      .whatsapp-contact-block .field { margin-bottom: 10px; }
      .whatsapp-consent { display:flex; gap:10px; align-items:flex-start; font-size:.9rem; line-height:1.4; cursor:pointer; }
      .whatsapp-consent input { margin-top:3px; flex:0 0 auto; }
      .field-hint { display:block; margin-top:6px; opacity:.7; font-size:.78rem; line-height:1.35; }
      #academySettingsModal { width:min(620px, calc(100vw - 28px)); }
      #academySettingsModal .settings-copy { margin:0 0 18px; opacity:.75; }
      .settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .settings-grid .wide { grid-column:1 / -1; }
      @media (max-width:650px) { .settings-grid { grid-template-columns:1fr; } .settings-grid .wide { grid-column:auto; } }
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

  function injectStudentContactFields() {
    if (byId('p1Phone')) return;
    const p1Block = byId('p1EntryValue')?.closest('.financial-person-block');
    const p2Block = byId('p2EntryValue')?.closest('.financial-person-block');
    if (p1Block) p1Block.insertAdjacentHTML('beforeend', contactMarkup('person1'));
    if (p2Block) p2Block.insertAdjacentHTML('beforeend', contactMarkup('person2'));

    [['p1Phone', 'p1WhatsappConsent'], ['p2Phone', 'p2WhatsappConsent']].forEach(([phoneId, consentId]) => {
      const phone = byId(phoneId);
      const consent = byId(consentId);
      if (!phone || !consent) return;
      const sync = () => {
        const hasValue = Boolean(phone.value.trim());
        consent.disabled = !hasValue;
        if (!hasValue) consent.checked = false;
      };
      phone.addEventListener('input', sync);
      sync();
    });
  }

  function injectSettingsUi() {
    if (!byId('academySettingsBtn')) {
      const logout = byId('logoutBtn');
      if (logout) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'academySettingsBtn';
        button.className = 'btn btn-account';
        button.textContent = 'Configurações';
        logout.parentNode.insertBefore(button, logout);
      }
    }

    if (byId('academySettingsModal')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'academySettingsModal';
    dialog.innerHTML = `
      <div class="modal-head">
        <div>
          <h2>Configurações da academia</h2>
          <p>Esses dados identificam sua academia nos recibos e mensagens automáticas.</p>
        </div>
        <button class="close" type="button" id="closeAcademySettings" aria-label="Fechar">×</button>
      </div>
      <form id="academySettingsForm">
        <p class="settings-copy">A Dassaevy Labs mantém os textos automáticos padronizados. Aqui você configura somente a identidade e o contato da sua academia.</p>
        <div class="settings-grid">
          <div class="field wide">
            <label for="academyName">Nome da academia</label>
            <input id="academyName" maxlength="160" required placeholder="Ex.: Academia Arte Nativa">
          </div>
          <div class="field">
            <label for="academyResponsible">Professor / responsável</label>
            <input id="academyResponsible" maxlength="160" placeholder="Ex.: Jackson de Mattia">
          </div>
          <div class="field">
            <label for="academySupportPhone">Telefone para dúvidas</label>
            <input id="academySupportPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex.: (48) 99999-9999">
          </div>
          <div class="field wide">
            <label for="academyDisplayName">Nome exibido nas mensagens (opcional)</label>
            <input id="academyDisplayName" maxlength="160" placeholder="Se vazio, será usado o nome da academia">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-light" id="cancelAcademySettings">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar configurações</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
  }

  function openSettingsDialog() {
    const dialog = byId('academySettingsModal');
    if (!dialog) return;
    if (typeof openDialog === 'function') openDialog(dialog);
    else dialog.showModal();
  }

  function closeSettingsDialog() {
    const dialog = byId('academySettingsModal');
    if (!dialog) return;
    if (typeof closeDialog === 'function') closeDialog(dialog);
    else if (dialog.open) dialog.close();
  }

  async function loadAcademyProfile() {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    const { data, error } = await db
      .from('academy_profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      if (typeof toast === 'function') toast('Não foi possível carregar as configurações.');
      return;
    }
    byId('academyName').value = data?.academy_name || '';
    byId('academyResponsible').value = data?.responsible_name || '';
    byId('academySupportPhone').value = data?.support_phone || '';
    byId('academyDisplayName').value = data?.display_name || '';
  }

  async function saveAcademyProfile(event) {
    event.preventDefault();
    if (typeof currentUser === 'undefined' || !currentUser) return;
    const supportRaw = byId('academySupportPhone').value.trim();
    const supportPhone = normalizePhone(supportRaw);
    if (supportRaw && !supportPhone) {
      if (typeof toast === 'function') toast('Informe um telefone válido para dúvidas.');
      return;
    }
    const academyName = byId('academyName').value.trim();
    const payload = {
      user_id: currentUser.id,
      academy_name: academyName,
      responsible_name: byId('academyResponsible').value.trim(),
      support_phone: supportPhone,
      display_name: byId('academyDisplayName').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { error } = await db.from('academy_profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) {
      console.error(error);
      if (typeof toast === 'function') toast('Não foi possível salvar as configurações.');
      return;
    }
    closeSettingsDialog();
    if (typeof toast === 'function') toast('Configurações da academia salvas!');
    document.dispatchEvent(new CustomEvent('academy-profile-updated', { detail: payload }));
  }

  function clearContactFields() {
    ['p1Phone', 'p2Phone'].forEach(id => { if (byId(id)) byId(id).value = ''; });
    ['p1WhatsappConsent', 'p2WhatsappConsent'].forEach(id => {
      if (byId(id)) {
        byId(id).checked = false;
        byId(id).disabled = true;
      }
    });
  }

  async function populateStudentContactFields(id) {
    clearContactFields();
    if (!id) return;
    const { data, error } = await db
      .from('students')
      .select('person1_phone, person2_phone, person1_whatsapp_consent, person2_whatsapp_consent')
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
    byId('p1WhatsappConsent').disabled = !data.person1_phone;
    byId('p2WhatsappConsent').disabled = !data.person2_phone;
  }

  async function saveStudentWithAutomationData(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const id = byId('editingId').value;
    const person2 = byId('person2').value.trim();
    const p1Raw = byId('p1Phone').value.trim();
    const p2Raw = byId('p2Phone').value.trim();
    const p1Phone = normalizePhone(p1Raw);
    const p2Phone = person2 ? normalizePhone(p2Raw) : null;

    if ((p1Raw && !p1Phone) || (person2 && p2Raw && !p2Phone)) {
      if (typeof toast === 'function') toast('Confira o WhatsApp informado. Use DDD + número.');
      return;
    }

    const previous = id
      ? await db.from('students')
          .select('person1_whatsapp_consent, person2_whatsapp_consent, person1_whatsapp_consent_at, person2_whatsapp_consent_at')
          .eq('id', id)
          .single()
      : { data: null, error: null };

    if (previous.error) {
      console.error(previous.error);
      if (typeof toast === 'function') toast('Não foi possível validar o consentimento atual.');
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
      if (typeof toast === 'function') toast('Não foi possível salvar.');
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

    if (typeof closeDialog === 'function') closeDialog(byId('modal'));
    else byId('modal').close();
    render();
    if (typeof toast === 'function') toast('Cadastro salvo!');
  }

  function wireUi() {
    injectStyles();
    injectStudentContactFields();
    injectSettingsUi();

    byId('academySettingsBtn')?.addEventListener('click', async () => {
      await loadAcademyProfile();
      openSettingsDialog();
    });
    byId('academySettingsForm')?.addEventListener('submit', saveAcademyProfile);
    byId('closeAcademySettings')?.addEventListener('click', closeSettingsDialog);
    byId('cancelAcademySettings')?.addEventListener('click', closeSettingsDialog);
    byId('academySettingsModal')?.addEventListener('cancel', event => {
      event.preventDefault();
      closeSettingsDialog();
    });

    byId('newBtn')?.addEventListener('click', clearContactFields);

    if (typeof window.editCouple === 'function') {
      const originalEditCouple = window.editCouple;
      window.editCouple = function (id) {
        originalEditCouple(id);
        populateStudentContactFields(id);
      };
    }

    byId('form')?.addEventListener('submit', saveStudentWithAutomationData, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUi, { once: true });
  else wireUi();
})(typeof window !== 'undefined' ? window : globalThis);
