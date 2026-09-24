import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../core/academy-context.js', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);

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


test('resolve coalesces concurrent and immediate duplicate membership reads', async () => {
    const AcademyContext = loadAcademyContext();
    let readCount = 0;
    let releaseRead;
    const pendingRead = new Promise(resolve => {
        releaseRead = resolve;
    });
    const query = {
        select() {
            return this;
        },
        eq() {
            return this;
        },
        maybeSingle() {
            readCount += 1;
            return pendingRead;
        }
    };
    const db = {
        from(table) {
            assert.equal(table, 'academy_members');
            return query;
        }
    };
    const user = { id: 'user-a' };

    const first = AcademyContext.resolve(db, user);
    const second = AcademyContext.resolve(db, user);

    assert.equal(readCount, 1);
    releaseRead({ data: { academy_id: 'academy-a' }, error: null });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.academyId, 'academy-a');
    assert.equal(secondResult.academyId, 'academy-a');

    const immediate = await AcademyContext.resolve(db, user);
    assert.equal(immediate.academyId, 'academy-a');
    assert.equal(readCount, 1);
});

test('resolve never caches a missing academy', async () => {
    const AcademyContext = loadAcademyContext();
    let readCount = 0;
    const query = {
        select() {
            return this;
        },
        eq() {
            return this;
        },
        maybeSingle() {
            readCount += 1;
            return Promise.resolve({ data: null, error: null });
        }
    };
    const db = {
        from() {
            return query;
        }
    };

    const first = await AcademyContext.resolve(db, { id: 'new-user' });
    const second = await AcademyContext.resolve(db, { id: 'new-user' });

    assert.equal(first.academyId, null);
    assert.equal(second.academyId, null);
    assert.equal(readCount, 2);
});

test('resolve cache is scoped to the authenticated user', async () => {
    const AcademyContext = loadAcademyContext();
    let readCount = 0;
    let activeUser = null;
    const query = {
        select() {
            return this;
        },
        eq(column, value) {
            if (column === 'user_id') activeUser = value;
            return this;
        },
        maybeSingle() {
            readCount += 1;
            return Promise.resolve({
                data: { academy_id: `academy-for-${activeUser}` },
                error: null
            });
        }
    };
    const db = {
        from() {
            return query;
        }
    };

    const first = await AcademyContext.resolve(db, { id: 'user-a' });
    const second = await AcademyContext.resolve(db, { id: 'user-b' });

    assert.equal(first.academyId, 'academy-for-user-a');
    assert.equal(second.academyId, 'academy-for-user-b');
    assert.equal(readCount, 2);
});

test('bootstrap invalidates a previously resolved academy cache', async () => {
    const AcademyContext = loadAcademyContext();
    let readCount = 0;
    let academyId = 'academy-a';
    const query = {
        select() {
            return this;
        },
        eq() {
            return this;
        },
        maybeSingle() {
            readCount += 1;
            return Promise.resolve({
                data: { academy_id: academyId },
                error: null
            });
        }
    };
    const db = {
        from() {
            return query;
        },
        rpc() {
            academyId = 'academy-b';
            return Promise.resolve({ data: academyId, error: null });
        }
    };

    assert.equal(
        (await AcademyContext.resolve(db, { id: 'user-a' })).academyId,
        'academy-a'
    );
    assert.equal(
        (await AcademyContext.resolve(db, { id: 'user-a' })).academyId,
        'academy-a'
    );
    assert.equal(readCount, 1);

    await AcademyContext.bootstrap(db, 'Academia Atualizada');

    assert.equal(
        (await AcademyContext.resolve(db, { id: 'user-a' })).academyId,
        'academy-b'
    );
    assert.equal(readCount, 2);
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
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'bootstrap_academy');
    assert.equal(calls[0][1].academy_name, 'Academia Nova');
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

test('academy context loads after Supabase config and before the core app script', () => {
    const html = fs.readFileSync(indexUrl, 'utf8');
    const configIndex = html.indexOf('./js/core/supabase-config.js');
    const academyContextIndex = html.indexOf('./js/core/academy-context.js');
    const coreScriptIndex = html.indexOf('./js/core/script.js');

    assert.ok(configIndex >= 0, 'Supabase config script must be present');
    assert.ok(academyContextIndex > configIndex, 'academy context must load after Supabase config');
    assert.ok(coreScriptIndex > academyContextIndex, 'core app script must load after academy context');
});
