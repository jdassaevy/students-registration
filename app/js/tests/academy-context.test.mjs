import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../core/academy-context.js', import.meta.url);

function loadAcademyContext() {
    const source = fs.readFileSync(moduleUrl, 'utf8');
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context.window.AcademyContext;
}

function membershipDb({ data = null, error = null } = {}) {
    const calls = [];
    const query = {
        select(columns) {
            calls.push(['select', columns]);
            return this;
        },
        eq(column, value) {
            calls.push(['eq', column, value]);
            return this;
        },
        maybeSingle() {
            calls.push(['maybeSingle']);
            return Promise.resolve({ data, error });
        }
    };

    return {
        calls,
        from(table) {
            calls.push(['from', table]);
            return query;
        }
    };
}

test('resolve returns the active academy for the authenticated user', async () => {
    const AcademyContext = loadAcademyContext();
    const db = membershipDb({ data: { academy_id: 'academy-a' } });

    const result = await AcademyContext.resolve(db, { id: 'user-a' });

    assert.equal(result.academyId, 'academy-a');
    assert.deepEqual(db.calls, [
        ['from', 'academy_members'],
        ['select', 'academy_id'],
        ['eq', 'user_id', 'user-a'],
        ['eq', 'is_active', true],
        ['maybeSingle']
    ]);
});

test('resolve returns null when the user has no active academy', async () => {
    const AcademyContext = loadAcademyContext();
    const db = membershipDb({ data: null });

    const result = await AcademyContext.resolve(db, { id: 'user-without-academy' });

    assert.equal(result.academyId, null);
});

test('resolve surfaces Supabase membership errors', async () => {
    const AcademyContext = loadAcademyContext();
    const failure = new Error('membership query failed');
    const db = membershipDb({ error: failure });

    await assert.rejects(
        () => AcademyContext.resolve(db, { id: 'user-a' }),
        failure
    );
});

test('bootstrap calls bootstrap_academy and returns its uuid', async () => {
    const AcademyContext = loadAcademyContext();
    const calls = [];
    const db = {
        rpc(name, params) {
            calls.push([name, params]);
            return Promise.resolve({ data: 'academy-new', error: null });
        }
    };

    const academyId = await AcademyContext.bootstrap(db, '  Academia Nova  ');

    assert.equal(academyId, 'academy-new');
    assert.deepEqual(calls, [
        ['bootstrap_academy', { academy_name: 'Academia Nova' }]
    ]);
});

test('bootstrap rejects an empty academy name before calling Supabase', async () => {
    const AcademyContext = loadAcademyContext();
    let called = false;
    const db = {
        rpc() {
            called = true;
            return Promise.resolve({ data: null, error: null });
        }
    };

    await assert.rejects(
        () => AcademyContext.bootstrap(db, '   '),
        /academy name is required/i
    );
    assert.equal(called, false);
});
