import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../database/multi-academy-migration.sql', import.meta.url), 'utf8').toLowerCase();

test('operational tables use academy membership policies', () => {
    for (const table of ['classes', 'students', 'payment_events', 'receipts']) {
        assert.match(sql, new RegExp(`create\\s+policy[\\s\\S]*?on\\s+public\\.${table}[\\s\\S]*?is_academy_member\\s*\\(academy_id\\)`));
    }
    assert.match(sql, /has_active_support_access\s*\(academy_id\)/);
});

test('academy id is assigned by a database trigger for legacy frontend writes', () => {
    assert.match(sql, /create\s+or\s+replace\s+function\s+public\.assign_tenant_academy_id/);
    for (const table of ['classes', 'students', 'payment_events', 'receipts']) {
        assert.match(sql, new RegExp(`create\\s+trigger\\s+assign_${table}_academy`));
    }
});

test('profile privilege fields are protected from ordinary users', () => {
    assert.match(sql, /protect_profile_privileges/);
    assert.match(sql, /platform_role/);
    assert.match(sql, /subscription_exempt/);
});
