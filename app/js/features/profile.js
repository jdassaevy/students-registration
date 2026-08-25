(() => {
    if (typeof document === 'undefined' || document.getElementById('profileView')) return;

    const nav = document.querySelector('.view-tabs');
    const main = document.querySelector('main.app');
    if (!nav || !main) return;

    let currentAcademy = null;
    let currentProfile = null;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'view-tab';
    tab.id = 'profileTab';
    tab.textContent = 'Meu Perfil';
    nav.appendChild(tab);

    const section = document.createElement('section');
    section.id = 'profileView';
    section.className = 'profile-view';
    section.hidden = true;
    section.innerHTML = `
        <section class="profile-hero panel">
            <div><span class="profile-kicker">Conta e identidade</span><h2>Meu Perfil</h2><p>Atualize os dados oficiais da academia e do professor responsável.</p></div>
        </section>
        <div class="profile-grid">
            <form id="profileAcademyForm" class="profile-card panel">
                <div class="profile-card-head"><div><span class="profile-kicker">Dados da academia</span><h3>Identidade oficial</h3></div></div>
                <div class="field"><label for="profileAcademyName">Nome da academia</label><input id="profileAcademyName" maxlength="160" required></div>
                <div class="field"><label for="profileAcademyEmail">E-mail oficial</label><input id="profileAcademyEmail" type="email" maxlength="320" required></div>
                <div class="field"><label for="profileAcademyPhone">WhatsApp oficial</label><input id="profileAcademyPhone" type="tel" inputmode="tel" required></div>
                <div class="profile-logo-block">
                    <div class="profile-logo-preview"><img id="profileAcademyLogoPreview" alt="Logo da academia" hidden><span id="profileAcademyLogoEmpty">Sem logo cadastrada</span></div>
                    <div class="field"><label for="profileAcademyLogo">Logo personalizada</label><input id="profileAcademyLogo" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG ou WebP de até 2 MB.</small></div>
                    <button type="button" class="btn btn-light" id="removeAcademyLogo">Remover logo</button>
                </div>
                <div class="modal-actions"><button type="submit" class="btn btn-primary">Salvar academia</button></div>
            </form>

            <form id="profileResponsibleForm" class="profile-card panel">
                <div class="profile-card-head"><div><span class="profile-kicker">Professor responsável</span><h3>Dados pessoais</h3></div></div>
                <div class="field"><label for="profileResponsibleName">Nome do professor</label><input id="profileResponsibleName" maxlength="160" required></div>
                <div class="field"><label for="profileResponsibleEmail">E-mail de login</label><input id="profileResponsibleEmail" type="email" readonly></div>
                <div class="field"><label for="profileResponsiblePhone">Telefone pessoal</label><input id="profileResponsiblePhone" type="tel" inputmode="tel" required></div>
                <div class="modal-actions"><button type="submit" class="btn btn-primary">Salvar professor</button></div>
            </form>

            <form id="profileSecurityForm" class="profile-card panel profile-security-card">
                <div class="profile-card-head"><div><span class="profile-kicker">Segurança</span><h3>Alterar senha</h3></div></div>
                <div class="field"><label for="profileCurrentPassword">Senha atual</label><input id="profileCurrentPassword" type="password" autocomplete="current-password" required></div>
                <div class="field"><label for="profileNewPassword">Nova senha</label><input id="profileNewPassword" type="password" minlength="6" autocomplete="new-password" required></div>
                <div class="field"><label for="profileNewPasswordConfirm">Confirmar nova senha</label><input id="profileNewPasswordConfirm" type="password" minlength="6" autocomplete="new-password" required></div>
                <div class="modal-actions"><button type="submit" class="btn btn-primary">Alterar senha</button></div>
            </form>
        </div>`;
    main.appendChild(section);

    const style = document.createElement('style');
    style.textContent = `
        .profile-view{display:grid;gap:18px}.profile-view[hidden]{display:none!important}.profile-hero{padding:23px 25px}.profile-hero h2,.profile-card h3{margin:0;color:var(--wine-dark);font-family:Georgia,serif}.profile-hero h2{font-size:clamp(25px,3vw,34px)}.profile-hero p{margin:7px 0 0;color:var(--muted)}.profile-kicker{display:block;margin-bottom:5px;color:var(--terracotta);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.profile-card{padding:22px 24px;display:grid;gap:14px}.profile-security-card{grid-column:1/-1}.profile-card-head{margin-bottom:2px}.profile-card h3{font-size:20px}.profile-logo-block{display:grid;gap:10px;padding:14px;border:1px solid var(--line);border-radius:14px;background:rgba(250,247,242,.6)}.profile-logo-preview{height:110px;display:grid;place-items:center;border:1px dashed var(--line);border-radius:12px;background:white;color:var(--muted);font-size:11px}.profile-logo-preview img{max-width:220px;max-height:86px;object-fit:contain}.profile-logo-block small{color:var(--muted);font-size:10px}@media(max-width:850px){.profile-grid{grid-template-columns:1fr}.profile-security-card{grid-column:auto}}
    `;
    document.head.appendChild(style);

    const byId = id => document.getElementById(id);
    const normalizedPhone = value => AcademyContext.normalizePhone(value);

    async function activeAcademyId() {
        let id = AcademyContext.getActiveAcademyId();
        if (!id && typeof currentUser !== 'undefined' && currentUser) {
            await AcademyContext.resolve(currentUser);
            id = AcademyContext.getActiveAcademyId();
        }
        if (!id) throw new Error('Academia não identificada.');
        return id;
    }

    async function renderLogoPreview(path) {
        const image = byId('profileAcademyLogoPreview');
        const empty = byId('profileAcademyLogoEmpty');
        if (!path) {
            image.hidden = true;
            image.removeAttribute('src');
            empty.hidden = false;
            return;
        }
        const {data, error} = await db.storage.from('academy-logos').createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) {
            image.hidden = true;
            empty.hidden = false;
            return;
        }
        image.src = data.signedUrl;
        image.hidden = false;
        empty.hidden = true;
    }

    async function loadProfile() {
        const academyId = await activeAcademyId();
        const [academyResult, profileResult] = await Promise.all([
            db.from('academies').select('id,name,contact_email,contact_phone,logo_path,subscription_status').eq('id', academyId).single(),
            db.from('profiles').select('user_id,full_name,phone').eq('user_id', currentUser.id).single()
        ]);
        if (academyResult.error) throw academyResult.error;
        if (profileResult.error) throw profileResult.error;
        currentAcademy = academyResult.data;
        currentProfile = profileResult.data;
        byId('profileAcademyName').value = currentAcademy.name || '';
        byId('profileAcademyEmail').value = currentAcademy.contact_email || currentUser.email || '';
        byId('profileAcademyPhone').value = currentAcademy.contact_phone || '';
        byId('profileResponsibleName').value = currentProfile.full_name || '';
        byId('profileResponsibleEmail').value = currentUser.email || '';
        byId('profileResponsiblePhone').value = currentProfile.phone || '';
        byId('removeAcademyLogo').disabled = !currentAcademy.logo_path;
        await renderLogoPreview(currentAcademy.logo_path);
    }

    async function saveAcademy(event) {
        event.preventDefault();
        const academyId = await activeAcademyId();
        const phone = normalizedPhone(byId('profileAcademyPhone').value);
        if (!phone) return toast('Informe um WhatsApp válido para a academia.');
        const payload = {
            name: byId('profileAcademyName').value.trim(),
            contact_email: byId('profileAcademyEmail').value.trim(),
            contact_phone: phone,
            updated_at: new Date().toISOString()
        };
        if (!payload.name || !payload.contact_email) return toast('Preencha os dados obrigatórios da academia.');
        const {error} = await db.from('academies').update(payload).eq('id', academyId);
        if (error) return toast('Não foi possível salvar os dados da academia.');
        currentAcademy = {...currentAcademy, ...payload};
        toast('Dados da academia atualizados.');
    }

    async function saveResponsible(event) {
        event.preventDefault();
        const phone = normalizedPhone(byId('profileResponsiblePhone').value);
        const fullName = byId('profileResponsibleName').value.trim();
        if (!fullName || !phone) return toast('Preencha nome e telefone do professor.');
        const {error} = await db.from('profiles').update({full_name: fullName, phone}).eq('user_id', currentUser.id);
        if (error) return toast('Não foi possível salvar os dados do professor.');
        currentProfile = {...currentProfile, full_name: fullName, phone};
        toast('Dados do professor atualizados.');
    }

    async function uploadLogo() {
        const input = byId('profileAcademyLogo');
        const file = input.files?.[0];
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
            input.value = '';
            return toast('Use uma imagem PNG, JPG ou WebP de até 2 MB.');
        }
        const academyId = await activeAcademyId();
        const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${academyId}/logo.${extension}`;
        const {error: uploadError} = await db.storage.from('academy-logos').upload(path, file, {upsert: true, contentType: file.type});
        if (uploadError) return toast('Não foi possível enviar a logo.');
        if (currentAcademy?.logo_path && currentAcademy.logo_path !== path) {
            await db.storage.from('academy-logos').remove([currentAcademy.logo_path]);
        }
        const {error} = await db.from('academies').update({logo_path: path, updated_at: new Date().toISOString()}).eq('id', academyId);
        if (error) return toast('Logo enviada, mas não foi possível vinculá-la à academia.');
        currentAcademy = {...currentAcademy, logo_path: path};
        byId('removeAcademyLogo').disabled = false;
        input.value = '';
        await renderLogoPreview(path);
        toast('Logo atualizada.');
    }

    async function removeAcademyLogo() {
        if (!currentAcademy?.logo_path) return;
        const academyId = await activeAcademyId();
        const oldPath = currentAcademy.logo_path;
        const {error} = await db.from('academies').update({logo_path: null, updated_at: new Date().toISOString()}).eq('id', academyId);
        if (error) return toast('Não foi possível remover a logo.');
        await db.storage.from('academy-logos').remove([oldPath]);
        currentAcademy = {...currentAcademy, logo_path: null};
        byId('removeAcademyLogo').disabled = true;
        await renderLogoPreview(null);
        toast('Logo removida.');
    }

    async function changePassword(event) {
        event.preventDefault();
        const currentPassword = byId('profileCurrentPassword').value;
        const newPassword = byId('profileNewPassword').value;
        const confirmation = byId('profileNewPasswordConfirm').value;
        if (newPassword.length < 6) return toast('A nova senha precisa ter pelo menos 6 caracteres.');
        if (newPassword !== confirmation) return toast('A confirmação da nova senha não confere.');
        const {error: reauthError} = await db.auth.signInWithPassword({email: currentUser.email, password: currentPassword});
        if (reauthError) return toast('Senha atual incorreta.');
        const {error} = await db.auth.updateUser({password: newPassword});
        if (error) return toast('Não foi possível alterar a senha.');
        event.currentTarget.reset();
        toast('Senha alterada com sucesso.');
    }

    byId('profileAcademyForm').addEventListener('submit', saveAcademy);
    byId('profileResponsibleForm').addEventListener('submit', saveResponsible);
    byId('profileSecurityForm').addEventListener('submit', changePassword);
    byId('profileAcademyLogo').addEventListener('change', uploadLogo);
    byId('removeAcademyLogo').addEventListener('click', removeAcademyLogo);

    const originalSetView = typeof setView === 'function' ? setView : null;
    if (originalSetView) {
        setView = function (view) {
            if (view !== 'profile') {
                section.hidden = true;
                tab.classList.remove('active');
                return originalSetView(view);
            }
            activeView = 'profile';
            document.querySelectorAll('main.app > [id$="View"]').forEach(viewElement => {
                if (viewElement.id !== 'profileView') viewElement.hidden = true;
            });
            section.hidden = false;
            document.querySelectorAll('.view-tab').forEach(item => item.classList.remove('active'));
            tab.classList.add('active');
            loadProfile().catch(error => {
                console.warn('profile load failed', error.message);
                toast('Não foi possível carregar o perfil.');
            });
            if (typeof animateView === 'function') animateView(section);
        };
    }

    tab.addEventListener('click', () => setView('profile'));
})();
