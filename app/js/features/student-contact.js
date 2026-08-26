(() => {
    if (typeof document === 'undefined' || typeof db === 'undefined') return;
    const form = document.getElementById('form');
    const person2Input = document.getElementById('person2');
    const classField = document.getElementById('coupleClass')?.closest('.field');
    if (!form || !person2Input || !classField || document.getElementById('studentContactFields')) return;

    const markup = `
        <div id="studentContactFields" class="wide" style="display:grid;gap:12px">
            <div class="financial-person-block" style="margin:0">
                <h3>Contato da primeira pessoa</h3>
                <div class="value-grid">
                    <div class="field"><label for="studentPerson1Phone">Telefone / WhatsApp (opcional)</label><input id="studentPerson1Phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex.: (48) 99999-9999"></div>
                    <label class="check" style="align-self:end;margin-bottom:10px"><input type="checkbox" id="studentPerson1Consent"> Autorizou receber mensagens pelo WhatsApp</label>
                </div>
            </div>
            <div class="financial-person-block" id="studentPerson2Contact" style="margin:0" hidden>
                <h3>Contato da segunda pessoa</h3>
                <div class="value-grid">
                    <div class="field"><label for="studentPerson2Phone">Telefone / WhatsApp (opcional)</label><input id="studentPerson2Phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex.: (48) 99999-9999"></div>
                    <label class="check" style="align-self:end;margin-bottom:10px"><input type="checkbox" id="studentPerson2Consent"> Autorizou receber mensagens pelo WhatsApp</label>
                </div>
            </div>
        </div>`;
    classField.insertAdjacentHTML('afterend', markup);

    const byId = id => document.getElementById(id);
    const p1Phone = byId('studentPerson1Phone');
    const p2Phone = byId('studentPerson2Phone');
    const p1Consent = byId('studentPerson1Consent');
    const p2Consent = byId('studentPerson2Consent');
    const p2Contact = byId('studentPerson2Contact');

    function normalizePhone(value) {
        let digits = String(value || '').replace(/\D/g, '');
        if (!digits) return null;
        if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
        if (![12, 13].includes(digits.length) || !digits.startsWith('55')) {
            throw new Error('Informe um telefone/WhatsApp válido com DDD ou deixe o campo vazio.');
        }
        return digits;
    }

    function formatPhone(value) {
        const digits = String(value || '').replace(/\D/g, '').replace(/^55/, '');
        if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
        return value || '';
    }

    function syncPerson2() {
        const visible = Boolean(person2Input.value.trim());
        p2Contact.hidden = !visible;
        if (!visible) {
            p2Phone.value = '';
            p2Consent.checked = false;
        }
    }

    function clearContacts() {
        p1Phone.value = '';
        p2Phone.value = '';
        p1Consent.checked = false;
        p2Consent.checked = false;
        syncPerson2();
    }

    async function loadContacts(id) {
        if (!id) return clearContacts();
        const { data, error } = await db.from('students')
            .select('person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent')
            .eq('id', id).maybeSingle();
        if (error || !data) return;
        p1Phone.value = formatPhone(data.person1_phone);
        p2Phone.value = formatPhone(data.person2_phone);
        p1Consent.checked = Boolean(data.person1_whatsapp_consent);
        p2Consent.checked = Boolean(data.person2_whatsapp_consent);
        syncPerson2();
    }

    person2Input.addEventListener('input', syncPerson2);

    const originalOpenNew = typeof openNew === 'function' ? openNew : null;
    if (originalOpenNew) {
        openNew = function () {
            originalOpenNew();
            clearContacts();
        };
    }

    const originalEditCouple = typeof editCouple === 'function' ? editCouple : null;
    if (originalEditCouple) {
        editCouple = function (id) {
            originalEditCouple(id);
            loadContacts(id);
        };
    }

    async function waitForSavedStudent(snapshot) {
        if (snapshot.id) return snapshot.id;
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const found = Array.isArray(couples) && couples.find(item =>
                !snapshot.existingIds.has(item.id) &&
                item.person1 === snapshot.person1 &&
                (item.person2 || '') === snapshot.person2 &&
                (item.classId || '') === snapshot.classId
            );
            if (found) return found.id;
            await new Promise(resolve => setTimeout(resolve, 80));
        }
        return null;
    }

    form.addEventListener('submit', event => {
        let person1Phone;
        let person2Phone;
        try {
            person1Phone = normalizePhone(p1Phone.value);
            person2Phone = person2Input.value.trim() ? normalizePhone(p2Phone.value) : null;
        } catch (error) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (typeof toast === 'function') toast(error.message);
            return;
        }

        const snapshot = {
            id: byId('editingId').value,
            person1: byId('person1').value.trim(),
            person2: person2Input.value.trim(),
            classId: byId('coupleClass').value || '',
            existingIds: new Set(Array.isArray(couples) ? couples.map(item => item.id) : []),
            payload: {
                person1_phone: person1Phone,
                person2_phone: person2Phone,
                person1_whatsapp_consent: Boolean(person1Phone && p1Consent.checked),
                person2_whatsapp_consent: Boolean(person2Phone && p2Consent.checked),
                person1_whatsapp_consent_at: person1Phone && p1Consent.checked ? new Date().toISOString() : null,
                person2_whatsapp_consent_at: person2Phone && p2Consent.checked ? new Date().toISOString() : null
            }
        };

        setTimeout(async () => {
            const studentId = await waitForSavedStudent(snapshot);
            if (!studentId) return;
            const { error } = await db.from('students').update(snapshot.payload).eq('id', studentId);
            if (error) {
                console.warn('student contact save failed', error.message);
                if (typeof toast === 'function') toast('Cadastro salvo, mas não foi possível salvar o contato.');
            }
        }, 0);
    }, true);

    syncPerson2();
})();
