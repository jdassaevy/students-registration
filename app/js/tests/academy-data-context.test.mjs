import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../core/academy-data-context.js', import.meta.url);

function createBuilder(calls, table) {
    const builder = {
        select(...args) {
            calls.push([table, 'select', ...args]);
            return builder;
        },
        insert(values, ...args) {
            calls.push([table, 'insert', values, ...args]);
            return builder;
        },
        update(values, ...args) {
            calls.push([table, 'update', values, ...args]);
            return builder;
        },
        delete(...args) {
            calls.push([table, 'delete', ...args]);
            return builder;
        },
        upsert(values, ...args) {
            calls.push([table, 'upsert', values, ...args]);
            return builder;
        },
        eq(column, value) {
            calls.push([table, 'eq', column, value]);
            return builder;
        },
        order(...args) {
            calls.push([table, 'order', ...args]);
            return builder;
        },
        single() {
            calls.push([table, 'single']);
            return Promise.resolve({ data: null, error: null });
        },
        then(resolve) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
        }
    };
    return builder;
}

function harness({ academyId = 'academy-a' } = {}) {
    const calls = [];
    const client = {
        from(table) {
            calls.push([table, 'from']);
            return createBuilder(calls, table);
        }
    };
    const supabase = { createClient: () => client };
    const context = {
        window: {
            supabase,
            currentAcademyId: academyId
        },
        console
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(moduleUrl, 'utf8'), context);
    return { context, calls, db: context.window.supabase.createClient('url', 'key') };
}

test('selects from classes and students are filtered by the active academy', () => {
    const h = harness();

    h.db.from('classes').select('*').order('created_at');
    h.db.from('students').select('*').order('created_at');

    assert.deepEqual(h.calls, [
        ['classes', 'from'],
        ['classes', 'select', '*'],
        ['classes', 'eq', 'academy_id', 'academy-a'],
        ['classes', 'order', 'created_at'],
        ['students', 'from'],
        ['students', 'select', '*'],
        ['students', 'eq', 'academy_id', 'academy-a'],
        ['students', 'order', 'created_at']
    ]);
});

test('inserts force academy_id on objects and arrays', () => {
    const h = harness();

    h.db.from('classes').insert({ name: 'Básico', academy_id: 'wrong-academy' });
    h.db.from('students').insert([
        { person1: 'Ana' },
        { person1: 'João', academy_id: 'wrong-academy' }
    ]);

    assert.equal(
        JSON.stringify(h.calls[1][2]),
        JSON.stringify({ name: 'Básico', academy_id: 'academy-a' })
    );
    assert.equal(
        JSON.stringify(h.calls[3][2]),
        JSON.stringify([
            { person1: 'Ana', academy_id: 'academy-a' },
            { person1: 'João', academy_id: 'academy-a' }
        ])
    );
});

test('updates force academy_id and add an academy filter before row filters', () => {
    const h = harness();

    h.db.from('students').update({ payments: { person1: [true] } }).eq('id', 'student-1');

    assert.equal(
        JSON.stringify(h.calls[1][2]),
        JSON.stringify({
            payments: { person1: [true] },
            academy_id: 'academy-a'
        })
    );
    assert.deepEqual(h.calls.slice(2), [
        ['students', 'eq', 'academy_id', 'academy-a'],
        ['students', 'eq', 'id', 'student-1']
    ]);
});

test('deletes are academy filtered before row filters', () => {
    const h = harness();

    h.db.from('classes').delete().eq('id', 'class-1');

    assert.deepEqual(h.calls.slice(1), [
        ['classes', 'delete'],
        ['classes', 'eq', 'academy_id', 'academy-a'],
        ['classes', 'eq', 'id', 'class-1']
    ]);
});

test('non-domain tables are left untouched', () => {
    const h = harness();

    h.db.from('academy_members').select('academy_id');

    assert.deepEqual(h.calls, [
        ['academy_members', 'from'],
        ['academy_members', 'select', 'academy_id']
    ]);
});

test('tenant operations fail closed when no academy is active', () => {
    const h = harness({ academyId: null });

    assert.throws(
        () => h.db.from('students').select('*'),
        /academia ativa não foi resolvida/i
    );
    assert.throws(
        () => h.db.from('classes').insert({ name: 'Básico' }),
        /academia ativa não foi resolvida/i
    );
});
