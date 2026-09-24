(function attachAcademyContext(global) {
    'use strict';

    const RESOLVE_CACHE_TTL_MS = 2000;
    const resolvedCache = new Map();
    const inFlightResolves = new Map();

    function cachedAcademyId(userId) {
        const cached = resolvedCache.get(userId);
        if (!cached) {
            return null;
        }

        if (cached.expiresAt <= Date.now()) {
            resolvedCache.delete(userId);
            return null;
        }

        return cached.academyId;
    }

    async function resolve(db, user) {
        if (!db || !user?.id) {
            throw new Error('Authenticated user is required');
        }

        const userId = user.id;
        const cachedAcademy = cachedAcademyId(userId);
        if (cachedAcademy) {
            return { academyId: cachedAcademy };
        }

        const pending = inFlightResolves.get(userId);
        if (pending) {
            return pending;
        }

        const request = (async () => {
            const { data, error } = await db
                .from('academy_members')
                .select('academy_id')
                .eq('user_id', userId)
                .eq('is_active', true)
                .maybeSingle();

            if (error) {
                throw error;
            }

            const academyId = data?.academy_id || null;
            if (academyId) {
                resolvedCache.set(userId, {
                    academyId,
                    expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS
                });
            }

            return { academyId };
        })();

        inFlightResolves.set(userId, request);

        try {
            return await request;
        } finally {
            if (inFlightResolves.get(userId) === request) {
                inFlightResolves.delete(userId);
            }
        }
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

        resolvedCache.clear();
        return data;
    }

    global.AcademyContext = Object.freeze({
        resolve,
        bootstrap
    });
})(window);
