import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260901162000_academy_profile_bootstrap_backfill.sql',
  import.meta.url
);

test('bootstrap migration preserves legacy academy identity when creating a tenant', () => {
  assert.ok(fs.existsSync(migrationUrl), 'bootstrap identity migration must exist');
  const sql = fs.readFileSync(migrationUrl, 'utf8').toLowerCase();

  assert.match(sql, /create or replace function public\.bootstrap_academy\(academy_name text\)/);
  assert.match(sql, /from public\.academy_profiles/);
  assert.match(sql, /where profile\.user_id = v_user_id/);
  assert.match(sql, /responsible_name/);
  assert.match(sql, /support_phone/);
  assert.match(sql, /display_name/);
  assert.match(sql, /insert into public\.academies\s*\(name, responsible_name, support_phone, display_name\)/);
});

test('bootstrap migration keeps operational legacy rows attached to the new academy', () => {
  const sql = fs.readFileSync(migrationUrl, 'utf8').toLowerCase();
  for (const table of ['classes', 'students', 'payment_events', 'receipts']) {
    assert.match(sql, new RegExp(`update public\\.${table}[\\s\\S]*academy_id = v_academy_id[\\s\\S]*user_id = v_user_id`));
  }
});

test('existing membership remains idempotent and may receive missing legacy identity', () => {
  const sql = fs.readFileSync(migrationUrl, 'utf8').toLowerCase();
  assert.match(sql, /if v_academy_id is not null then/);
  assert.match(sql, /update public\.academies/);
  assert.match(sql, /coalesce\(nullif\(btrim\(academy\.responsible_name\), ''\), nullif\(btrim\(v_legacy_responsible_name\), ''\), ''\)/);
  assert.match(sql, /return v_academy_id/);
});
