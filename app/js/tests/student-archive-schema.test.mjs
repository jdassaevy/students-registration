import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL('../../../supabase/migrations/20260903203000_student_archive_removal.sql', import.meta.url);
const migrationPath = fileURLToPath(migrationUrl);
const migrationExists = fs.existsSync(migrationPath);
const migration = migrationExists ? fs.readFileSync(migrationPath, 'utf8') : '';

test('student archive migration exists', () => {
    assert.equal(migrationExists, true, 'student archive migration must exist');
});

test('students gain a nullable archive marker without backfill', () => {
    assert.match(migration, /add column if not exists archived_at timestamptz/i);
    assert.doesNotMatch(
        migration,
        /update\s+public\.students\s+set\s+archived_at\s*=\s*(?!now\(\))/i,
        'migration must not backfill existing students as archived'
    );
});

test('removal RPC runs as the caller and preserves tenant RLS', () => {
    assert.match(migration, /create or replace function public\.remove_student_from_operation\(p_student_id uuid\)/i);
    assert.match(migration, /security invoker/i);
    assert.match(migration, /set search_path\s*=\s*public,\s*pg_temp/i);
    assert.match(migration, /grant execute on function public\.remove_student_from_operation\(uuid\) to authenticated/i);
    assert.match(migration, /revoke all on function public\.remove_student_from_operation\(uuid\) from public/i);
    assert.match(migration, /revoke all on function public\.remove_student_from_operation\(uuid\) from anon/i);
});

test('history causes archive while no-history causes hard delete', () => {
    assert.match(migration, /from public\.receipts[\s\S]*student_id\s*=\s*p_student_id/i);
    assert.match(migration, /from public\.payment_events[\s\S]*student_id\s*=\s*p_student_id/i);
    assert.match(migration, /set archived_at\s*=\s*now\(\)/i);
    assert.match(migration, /return 'archived'/i);
    assert.match(migration, /delete from public\.students[\s\S]*id\s*=\s*p_student_id/i);
    assert.match(migration, /return 'deleted'/i);
});
