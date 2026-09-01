import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../features/academy-profile.js', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);
const configUrl = new URL('../core/supabase-config.js', import.meta.url);

function createBuilder(state, table) {
    const builder = {
        select(columns) {
            state.calls.push([table, 'select', columns]);
            return builder;
        },
        update(values) {
            state.calls.push([table, 'update', values]);
            state.lastUpdate = values;
            return builder;
        },
        eq(column, value) {
            state.calls.push([table, 'eq', column, value]);
            state.lastEq = [column, value];
            return builder;
        },
        single() {
            state.calls.push([table, 'single']);
            return Promise.resolve({
                data: state.responseData || {
                    id: 'academy-a',
                    name: 'Arte Nativa',
                    responsible_name: 'Jackson',
                    support_phone: '5548999999999',
                    display_name: null
                },
                error: state.responseError || null
            });
        }
    };
    return builder;
}

function harness({ academyId = 'academy-a', email = 'owner@example.com' } = {}) {
    const state = { calls: [], lastUpdate: null, lastEq: null };
    const db = {
        from(table) {
            state.calls.push([table, 'from']);
            return createBuilder(state, table);
        }
    };

    const document = {
        body: null,
        getElementById() { return null; },
        addEventListener() {}
    };

    const window = {
        currentAcademyId: academyId,
        addEventListener() {},
        dispatchEvent() {},
        document
    };

    const context = {
        window,
        document,
        db,
        currentUser: { id: 'user-a', email },
        console,
        CustomEvent: class CustomEvent {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(moduleUrl, 'utf8'), context);
    return { context, state };
}

test('profile loads the active academy by currentAcademyId', async () => {
    const h = harness();
    const data = await h.context.window.AcademyProfile.load();

    assert.equal(data.name, 'Arte Nativa');
    assert.deepEqual(h.state.calls, [
        ['academies', 'from'],
        ['academies', 'select', 'id,name,responsible_name,support_phone,display_name'],
        ['academies', 'eq', 'id', 'academy-a'],
        ['academies', 'single']
    ]);
});

test('profile fails closed without an active academy', async () => {
    const h = harness({ academyId: null });
    await assert.rejects(
        () => h.context.window.AcademyProfile.load(),
        /academia ativa não foi resolvida/i
    );
    assert.equal(h.state.calls.length, 0);
});

test('profile save updates only the active academy', async () => {
    const h = harness();
    await h.context.window.AcademyProfile.save({
        name: ' Arte Nativa ',
        responsibleName: ' Jackson de Mattia ',
        supportPhone: '(48) 99999-9999',
        displayName: ' '
    });

    assert.equal(JSON.stringify(h.state.lastUpdate), JSON.stringify({
        name: 'Arte Nativa',
        responsible_name: 'Jackson de Mattia',
        support_phone: '5548999999999',
        display_name: null
    }));
    assert.deepEqual(h.state.lastEq, ['id', 'academy-a']);
});

test('profile validation does not call Supabase for blank academy name', async () => {
    const h = harness();
    await assert.rejects(
        () => h.context.window.AcademyProfile.save({ name: '   ' }),
        /nome da academia/i
    );
    assert.equal(h.state.calls.length, 0);
});

test('profile validation rejects invalid phone before database access', async () => {
    const h = harness();
    await assert.rejects(
        () => h.context.window.AcademyProfile.save({
            name: 'Arte Nativa',
            supportPhone: '123'
        }),
        /telefone válido/i
    );
    assert.equal(h.state.calls.length, 0);
});

test('profile source is tenant-owned and account email is read-only', () => {
    const source = fs.readFileSync(moduleUrl, 'utf8');
    assert.match(source, /from\(['"]academies['"]\)/);
    assert.doesNotMatch(source, /from\(['"]academy_profiles['"]\)/);
    assert.doesNotMatch(source, /eq\(['"]user_id['"]/);
    assert.match(source, /academyProfileEmail/);
    assert.match(source, /readOnly\s*=\s*true|readonly/i);
});

test('index exposes Meu Perfil and loads profile assets after core script', () => {
    const html = fs.readFileSync(indexUrl, 'utf8');
    assert.match(html, /id="academyProfileBtn"[^>]*>Meu Perfil<\/button>/);
    assert.match(html, /\.\/css\/academy-profile\.css/);
    assert.match(html, /\.\/js\/features\/academy-profile\.js\?v=\d+/);
    assert.ok(
        html.indexOf('./js/features/academy-profile.js') > html.indexOf('./js/core/script.js'),
        'academy profile must load after db/currentUser core declarations'
    );
});

test('legacy user-owned academy settings are no longer injected', () => {
    const source = fs.readFileSync(configUrl, 'utf8');
    assert.doesNotMatch(source, /academy-settings\.js/);
    assert.doesNotMatch(source, /loadAcademySettings/);
});
