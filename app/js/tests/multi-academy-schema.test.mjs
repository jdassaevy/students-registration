import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, '../../../supabase/migrations/20260829112000_multi_academy_foundation.sql');

const readMigration = () => readFileSync(migrationPath, 'utf8').toLowerCase();

test('multi-academy migration defines tenant tables and academy ids', () => {
  const sql = readMigration();
  assert.match(sql, /create table if not exists public\.academies/);
  assert.match(sql, /create table if not exists public\.academy_members/);
  for (const table of ['classes', 'students', 'payment_events', 'receipts']) {
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists academy_id`));
  }
});

test('multi-academy migration defines membership and bootstrap functions', () => {
  const sql = readMigration();
  assert.match(sql, /create or replace function public\.is_academy_member\s*\(/);
  assert.match(sql, /create or replace function public\.bootstrap_academy\s*\(/);
  assert.match(sql, /role text not null[^;]*owner/);
});

test('domain policies are academy scoped', () => {
  const sql = readMigration();
  for (const table of ['classes', 'students', 'payment_events', 'receipts']) {
    assert.match(sql, new RegExp(`create policy[^;]+on public\\.${table}[\\s\\S]+is_academy_member\\(academy_id\\)`, 'i'));
  }
});

test('migration preserves legacy ownership columns and academy_profiles', () => {
  const sql = readMigration();
  assert.doesNotMatch(sql, /drop\s+column(?:\s+if\s+exists)?\s+user_id/);
  assert.doesNotMatch(sql, /drop\s+table(?:\s+if\s+exists)?\s+(?:public\.)?academy_profiles/);
});

test('stage 1 allows only one active academy membership per user', () => {
  const sql = readMigration();
  assert.match(sql, /create unique index[^;]+academy_members[^;]+user_id[^;]+where is_active = true/);
});
