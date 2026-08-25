(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AcademyContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    let activeAcademyId = null;
    let activeMembership = null;
    let supportMode = false;

    function getDb() {
        if (typeof db !== 'undefined') return db;
        if (root.db) return root.db;
        throw new Error('Supabase client is not available.');
    }

    function normalizePhone(value) {
        const digits = String(value ?? '').replace(/\D/g, '');
        if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
        if (digits.length === 10 || digits.length === 11) return `55${digits}`;
        return null;
    }

    function validateBootstrapPayload(payload = {}) {
        const academyName = String(payload.academyName ?? '').trim();
        const responsibleName = String(payload.responsibleName ?? '').trim();
        const phone = normalizePhone(payload.phone);
        if (!academyName) throw new Error('Informe o nome da academia.');
        if (!responsibleName) throw new Error('Informe o nome do responsável.');
        if (!phone) throw new Error('Informe um telefone/WhatsApp válido.');
        return {academyName, responsibleName, phone};
    }

    async function resolve(user) {
        if (!user?.id) {
            clear();
            return null;
        }
        const client = getDb();
        const {data, error} = await client
            .from('academy_members')
            .select('academy_id,role,is_active,academies(id,name,contact_email,contact_phone,logo_path,subscription_status)')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('created_at', {ascending: true})
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        activeMembership = data || null;
        activeAcademyId = data?.academy_id || null;
        supportMode = false;
        return activeMembership;
    }

    async function bootstrap(payload) {
        const normalized = validateBootstrapPayload(payload);
        const client = getDb();
        const {data, error} = await client.rpc('bootstrap_academy', {
            academy_name: normalized.academyName,
            responsible_name: normalized.responsibleName,
            contact_phone: normalized.phone
        });
        if (error) throw error;
        const academyId = typeof data === 'string' ? data : data?.academy_id;
        if (!academyId) throw new Error('Não foi possível identificar a academia criada.');
        activeAcademyId = academyId;
        activeMembership = {academy_id: academyId, role: 'owner', is_active: true};
        supportMode = false;
        return activeMembership;
    }

    function useSupportAcademy(academyId) {
        const normalized = String(academyId || '').trim();
        if (!normalized) throw new Error('Academia de suporte inválida.');
        activeAcademyId = normalized;
        activeMembership = null;
        supportMode = true;
        return activeAcademyId;
    }

    function getActiveAcademyId() {
        return activeAcademyId;
    }

    function getActiveMembership() {
        return activeMembership;
    }

    function isSupportMode() {
        return supportMode;
    }

    function clear() {
        activeAcademyId = null;
        activeMembership = null;
        supportMode = false;
    }

    return {
        normalizePhone,
        validateBootstrapPayload,
        resolve,
        bootstrap,
        useSupportAcademy,
        getActiveAcademyId,
        getActiveMembership,
        isSupportMode,
        clear
    };
});
