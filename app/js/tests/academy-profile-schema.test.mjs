import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../../../supabase/migrations/20260901123000_academy_profile_identity.sql', import.meta.url),
  'utf8'
).toLowerCase();

test('academy identity migration adds tenant-owned profile fields', () => {
  assert.match(sql, /add column if not exists responsible_name text/);
  assert.match(sql, /add column if not exists support_phone text/);
  assert.match(sql, /add column if not exists display_name text/);
});

test('legacy academy_profiles values are backfilled without overwriting populated academy fields', () => {
  assert.match(sql, /from public\.academy_members/);
  assert.match(sql, /join public\.academy_profiles/);
  assert.match(sql, /coalesce\(nullif\(btrim\(academy\.responsible_name\), ''\), profile\.responsible_name/);
  assert.doesNotMatch(sql, /drop table[^;]*academy_profiles/);
});

test('only active owners can update academy institutional fields', () => {
  assert.match(sql, /role = 'owner'/);
  assert.match(sql, /is_active = true/);
  assert.match(sql, /for update/);
  assert.match(sql, /grant update/);
});
