(() => {
    'use strict';

    const PROFILE_SELECT = 'id,name,responsible_name,support_phone,display_name';

    function activeAcademyId() {
        const value = String(window.currentAcademyId || '').trim();
        if (!value) {
            throw new Error('A academia ativa não foi resolvida.');
        }
        return value;
    }

    function normalizeProfilePhone(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const digits = raw.replace(/\D/g, '');
        if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
            return digits;
        }
        if (digits.length === 10 || digits.length === 11) {
            return `55${digits}`;
        }
        return null;
    }

    async function load() {
        const id = activeAcademyId();
        const { data, error } = await db
            .from('academies')
            .select(PROFILE_SELECT)
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async function save(values = {}) {
        const id = activeAcademyId();
        const name = String(values.name || '').trim();
        if (!name) {
            throw new Error('Informe o nome da academia.');
        }

        const rawPhone = String(values.supportPhone || '').trim();
        const supportPhone = normalizeProfilePhone(rawPhone);
        if (rawPhone && !supportPhone) {
            throw new Error('Informe um telefone válido.');
        }

        const payload = {
            name,
            responsible_name: String(values.responsibleName || '').trim(),
            support_phone: supportPhone,
            display_name: String(values.displayName || '').trim() || null
        };

        const { data, error } = await db
            .from('academies')
            .update(payload)
            .eq('id', id)
            .select(PROFILE_SELECT)
            .single();

        if (error) throw error;
        return data;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function ensureDialog() {
        const existing = byId('academyProfileDialog');
        if (existing) return existing;
        if (!document.body || typeof document.createElement !== 'function') return null;

        const dialog = document.createElement('dialog');
        dialog.id = 'academyProfileDialog';
        dialog.className = 'academy-profile-dialog';
        dialog.setAttribute('aria-labelledby', 'academyProfileTitle');
        dialog.innerHTML = `
            <div class="academy-profile-shell">
                <div class="academy-profile-head">
                    <div>
                        <span class="academy-profile-eyebrow">Conta da academia</span>
                        <h2 id="academyProfileTitle">Meu Perfil</h2>
                        <p>Atualize os dados institucionais usados pelo sistema.</p>
                    </div>
                    <button type="button" class="close" id="academyProfileClose" aria-label="Fechar">×</button>
                </div>

                <div class="academy-profile-skeleton" id="academyProfileSkeleton" aria-hidden="true">
                    <span></span><span></span><span></span><span></span>
                </div>

                <form id="academyProfileForm" class="academy-profile-form" aria-busy="false" hidden>
                    <section class="academy-profile-section" aria-labelledby="academyProfileDataTitle">
                        <div class="academy-profile-section-head">
                            <h3 id="academyProfileDataTitle">Dados da academia</h3>
                            <p>Estas informações pertencem à academia e serão compartilhadas pelos usuários autorizados.</p>
                        </div>
                        <div class="academy-profile-grid">
                            <div class="field wide">
                                <label for="academyProfileName">Nome da academia</label>
                                <input id="academyProfileName" maxlength="160" autocomplete="organization" required>
                            </div>
                            <div class="field">
                                <label for="academyProfileResponsible">Professor / responsável</label>
                                <input id="academyProfileResponsible" maxlength="160" autocomplete="name">
                            </div>
                            <div class="field">
                                <label for="academyProfilePhone">Telefone para contato</label>
                                <input id="academyProfilePhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Ex.: (48) 99999-9999">
                            </div>
                            <div class="field wide">
                                <label for="academyProfileDisplayName">Nome de exibição (opcional)</label>
                                <input id="academyProfileDisplayName" maxlength="160" placeholder="Se vazio, será usado o nome oficial">
                            </div>
                        </div>
                    </section>

                    <section class="academy-profile-section academy-profile-account" aria-labelledby="academyProfileAccountTitle">
                        <div class="academy-profile-section-head">
                            <h3 id="academyProfileAccountTitle">Conta</h3>
                            <p>O e-mail é somente informativo nesta etapa.</p>
                        </div>
                        <div class="field">
                            <label for="academyProfileEmail">E-mail da conta</label>
                            <input id="academyProfileEmail" type="email" autocomplete="email" readonly>
                        </div>
                    </section>

                    <p class="academy-profile-message" id="academyProfileMessage" role="status" aria-live="polite"></p>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-light" id="academyProfileCancel">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="academyProfileSave" aria-busy="false">Salvar alterações</button>
                    </div>
                </form>
            </div>`;

        document.body.appendChild(dialog);
        const emailInput = byId('academyProfileEmail');
        if (emailInput) emailInput.readOnly = true;

        byId('academyProfileClose')?.addEventListener('click', close);
        byId('academyProfileCancel')?.addEventListener('click', close);
        byId('academyProfileForm')?.addEventListener('submit', handleSubmit);
        return dialog;
    }

    function setLoading(isLoading) {
        const skeleton = byId('academyProfileSkeleton');
        const form = byId('academyProfileForm');
        if (skeleton) skeleton.hidden = !isLoading;
        if (form) form.hidden = isLoading;
    }

    function setSaving(isSaving) {
        const form = byId('academyProfileForm');
        const button = byId('academyProfileSave');
        if (form) form.setAttribute('aria-busy', String(isSaving));
        if (button) {
            button.disabled = isSaving;
            button.setAttribute('aria-busy', String(isSaving));
            button.textContent = isSaving ? 'Salvando...' : 'Salvar alterações';
        }
    }

    function render(data) {
        const name = byId('academyProfileName');
        const responsible = byId('academyProfileResponsible');
        const phone = byId('academyProfilePhone');
        const display = byId('academyProfileDisplayName');
        const email = byId('academyProfileEmail');

        if (name) name.value = data?.name || '';
        if (responsible) responsible.value = data?.responsible_name || '';
        if (phone) phone.value = data?.support_phone || '';
        if (display) display.value = data?.display_name || '';
        if (email) {
            email.value = typeof currentUser !== 'undefined' ? (currentUser?.email || '') : '';
            email.readOnly = true;
        }
    }

    function setMessage(message, isError = false) {
        const element = byId('academyProfileMessage');
        if (!element) return;
        element.textContent = message || '';
        element.classList.toggle('is-error', Boolean(isError));
    }

    async function open() {
        const dialog = ensureDialog();
        if (!dialog) return;

        setMessage('');
        setLoading(true);
        setSaving(false);
        if (typeof openDialog === 'function') openDialog(dialog);
        else if (!dialog.open) dialog.showModal();

        try {
            const data = await load();
            render(data);
            setLoading(false);
        } catch (error) {
            console.error('Não foi possível carregar o perfil da academia.', error);
            setLoading(false);
            setMessage('Não foi possível carregar os dados da academia. Tente novamente.', true);
        }
    }

    function close() {
        const dialog = byId('academyProfileDialog');
        if (!dialog) return;
        if (typeof closeDialog === 'function') closeDialog(dialog);
        else if (dialog.open) dialog.close();
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (byId('academyProfileSave')?.disabled) return;

        setMessage('');
        setSaving(true);
        try {
            const data = await save({
                name: byId('academyProfileName')?.value,
                responsibleName: byId('academyProfileResponsible')?.value,
                supportPhone: byId('academyProfilePhone')?.value,
                displayName: byId('academyProfileDisplayName')?.value
            });
            render(data);
            setMessage('Dados da academia atualizados com sucesso.');
            if (typeof toast === 'function') toast('Dados da academia atualizados!');
            window.dispatchEvent?.(new CustomEvent('academy-profile-updated', { detail: data }));
        } catch (error) {
            console.error('Não foi possível salvar o perfil da academia.', error);
            setMessage(error?.message || 'Não foi possível salvar os dados da academia.', true);
        } finally {
            setSaving(false);
        }
    }

    function bindEntryPoint() {
        byId('academyProfileBtn')?.addEventListener('click', open);
    }

    window.AcademyProfile = Object.freeze({
        load,
        save,
        open,
        close,
        normalizeProfilePhone
    });

    if (document.body) bindEntryPoint();
    else document.addEventListener?.('DOMContentLoaded', bindEntryPoint, { once: true });
})();
