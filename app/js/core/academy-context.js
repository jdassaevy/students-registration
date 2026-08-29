(function attachAcademyContext(global) {
    'use strict';

    async function resolve(db, user) {
        if (!db || !user?.id) {
            throw new Error('Authenticated user is required');
        }

        const { data, error } = await db
            .from('academy_members')
            .select('academy_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return { academyId: data?.academy_id || null };
    }

    async function bootstrap(db, academyName) {
        const name = String(academyName ?? '').trim();

        if (!name) {
            throw new Error('Academy name is required');
        }

        const { data, error } = await db.rpc('bootstrap_academy', {
            academy_name: name
        });

        if (error) {
            throw error;
        }

        return data;
    }

    global.AcademyContext = Object.freeze({
        resolve,
        bootstrap
    });
})(window);
