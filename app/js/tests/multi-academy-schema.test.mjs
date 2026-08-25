import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const schemaPath = new URL('../../database/supabase-schema.sql', import.meta.url);
const migrationPath = new URL('../../database/multi-academy-migration.sql', import.meta.url);

function readCombinedSql() {
    const base = readFileSync(schemaPath, 'utf8');
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
    return `${base}\n${migration}`.toLowerCase();
}

test('multi-academy foundation exists in database schema', () => {
    const sql = readCombinedSql();
    for (const table of ['profiles', 'academies', 'academy_members', 'support_access_logs']) {
        assert.match(sql, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`));
    }
    for (const table of ['classes', 'students', 'payment_events', 'receipts']) {
        assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}[\\s\\S]*?add\\s+column\\s+if\\s+not\\s+exists\\s+academy_id\\s+uuid`));
    }
});

test('authorization helpers are declared with fixed search_path', () => {
    const sql = readCombinedSql();
    for (const fn of ['is_platform_admin', 'is_academy_member', 'is_academy_owner']) {
        assert.match(sql, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}`));
    }
    assert.match(sql, /security\s+definer/);
    assert.match(sql, /set\s+search_path\s*=\s*public/);
});
