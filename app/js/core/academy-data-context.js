(() => {
    const supabase = window.supabase;
    if (!supabase?.createClient || supabase.__academyDataContextWrapped) {
        return;
    }

    const tenantTables = new Set(['classes', 'students', 'payment_events', 'receipts']);
    const originalCreateClient = supabase.createClient.bind(supabase);

    const requireAcademyId = () => {
        const academyId = String(window.currentAcademyId || '').trim();
        if (!academyId) {
            throw new Error('A academia ativa não foi resolvida.');
        }
        return academyId;
    };

    const withAcademyId = (values, academyId) => {
        if (Array.isArray(values)) {
            return values.map(value => ({
                ...value,
                academy_id: academyId
            }));
        }
        return {
            ...values,
            academy_id: academyId
        };
    };

    const wrapTableBuilder = (builder, table) => {
        if (!tenantTables.has(table)) {
            return builder;
        }

        return new Proxy(builder, {
            get(target, property, receiver) {
                if (property === 'select') {
                    return (...args) => {
                        const academyId = requireAcademyId();
                        return target.select(...args).eq('academy_id', academyId);
                    };
                }

                if (property === 'insert' || property === 'upsert') {
                    return (values, ...args) => {
                        const academyId = requireAcademyId();
                        return target[property](withAcademyId(values, academyId), ...args);
                    };
                }

                if (property === 'update') {
                    return (values, ...args) => {
                        const academyId = requireAcademyId();
                        return target
                            .update(withAcademyId(values, academyId), ...args)
                            .eq('academy_id', academyId);
                    };
                }

                if (property === 'delete') {
                    return (...args) => {
                        const academyId = requireAcademyId();
                        return target.delete(...args).eq('academy_id', academyId);
                    };
                }

                const value = Reflect.get(target, property, receiver);
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
    };

    supabase.__academyDataContextWrapped = true;
    supabase.createClient = (...args) => {
        const client = originalCreateClient(...args);
        const originalFrom = client.from.bind(client);

        client.from = table => wrapTableBuilder(originalFrom(table), table);
        return client;
    };

    window.AcademyDataContext = {
        requireAcademyId
    };
})();
