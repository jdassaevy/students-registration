import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL('../../../supabase/migrations/20260914_phase2b_rate_limiting.sql', import.meta.url),
  'utf8',
);

test('Phase 2B migration isolates limiter state and exposes only service-role RPC', () => {
  assert.match(sql, /create schema if not exists private/i);
  assert.match(sql, /private\.rate_limit_counters/i);
  assert.match(sql, /primary key\s*\(user_id,\s*endpoint,\s*window_start\)/i);
  assert.doesNotMatch(sql, /references\s+(auth\.|public\.)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path\s*=\s*pg_catalog,\s*private/i);
  assert.match(sql, /revoke execute on function public\.check_rate_limit.*from public, anon, authenticated/is);
  assert.match(sql, /grant execute on function public\.check_rate_limit.*to service_role/is);
  assert.match(sql, /least\([^;]*p_limit[^;]*\+\s*1/is);
});

test('Phase 2B cleanup targets only expired private limiter rows', () => {
  assert.match(sql, /create extension if not exists pg_cron/i);
  assert.match(sql, /cron\.schedule/i);
  assert.match(sql, /17 \* \* \* \*/);
  assert.match(sql, /delete from private\.rate_limit_counters/i);
  assert.match(sql, /interval '48 hours'/i);
  assert.doesNotMatch(sql, /delete from public\.(students|classes|receipts|payment_events|automation_messages)/i);
});
