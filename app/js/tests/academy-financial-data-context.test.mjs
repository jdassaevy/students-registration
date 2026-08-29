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
        delete(...args) {
            calls.push([table, 'delete', ...args]);
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
        then(resolve) {
            return Promise.resolve({data: [], error: null}).then(resolve);
        }
    };
    return builder;
}

function harness() {
    const calls = [];
    const client = {
        from(table) {
            calls.push([table, 'from']);
            return createBuilder(calls, table);
        }
    };
    const supabase = {createClient: () => client};
    const context = {
        window: {
            supabase,
            currentAcademyId: 'academy-a'
        },
        console
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(moduleUrl, 'utf8'), context);
    return {calls, db: context.window.supabase.createClient('url', 'key')};
}

test('payment_events inserts inherit the active academy', () => {
    const h = harness();

    h.db.from('payment_events').insert({student_id: 'student-1', amount: 100});

    assert.equal(
        JSON.stringify(h.calls[1][2]),
        JSON.stringify({
            student_id: 'student-1',
            amount: 100,
            academy_id: 'academy-a'
        })
    );
});

test('payment_events and receipts selects are scoped to the active academy', () => {
    const h = harness();

    h.db.from('payment_events').select('*').order('paid_at');
    h.db.from('receipts').select('*').order('created_at');

    assert.deepEqual(h.calls, [
        ['payment_events', 'from'],
        ['payment_events', 'select', '*'],
        ['payment_events', 'eq', 'academy_id', 'academy-a'],
        ['payment_events', 'order', 'paid_at'],
        ['receipts', 'from'],
        ['receipts', 'select', '*'],
        ['receipts', 'eq', 'academy_id', 'academy-a'],
        ['receipts', 'order', 'created_at']
    ]);
});
