import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function migration(name) {
  const url = new URL(`../../../supabase/migrations/${name}`, import.meta.url);
  assert.ok(fs.existsSync(url), `${name} must exist`);
  return fs.readFileSync(url, 'utf8').toLowerCase();
}

test('canonical hardening removes legacy tenant fallbacks and anon grants', () => {
  const sql = migration('20260911203000_canonical_security_hardening.sql');
  assert.doesNotMatch(sql, /academy_id\s+is\s+null\s+and\s+auth\.uid\(\)\s*=\s*user_id/);
  assert.match(sql, /revoke\s+all\s+on\s+public\.classes\s+from\s+anon/);
  assert.match(sql, /revoke\s+all\s+on\s+public\.students\s+from\s+anon/);
  assert.match(sql, /set\s+search_path\s*=\s*public/);
  assert.match(sql, /public\.is_academy_member\(v_academy_id\)/);
});


test('receipt audit allows only student unlink for preserved receipt history', () => {
  const sql = migration('20260911203500_allow_receipt_student_unlink_only.sql');
  assert.match(sql, /old\.student_id\s+is\s+distinct\s+from\s+new\.student_id/);
  assert.match(sql, /old\.student_id\s+is\s+not\s+null\s+and\s+new\.student_id\s+is\s+null/);
  assert.match(sql, /receipt audit fields are immutable/i);
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+public\.protect_receipt_audit_fields\(\)\s+from\s+authenticated/);
});

test('automation messages become academy scoped', () => {
  const sql = migration('20260911204000_automation_tenant_scope.sql');
  assert.match(sql, /add\s+column\s+if\s+not\s+exists\s+academy_id\s+uuid/);
  assert.match(sql, /unresolved automation messages/i);
  assert.match(sql, /conflicting automation messages/i);
  assert.match(sql, /alter\s+column\s+academy_id\s+set\s+not\s+null/);
  assert.match(sql, /public\.is_academy_member\(academy_id\)/);
});

test('archive history is explicitly deny-all to browser clients', () => {
  const sql = migration('20260911205500_archive_history_client_deny.sql');
  assert.match(sql, /create\s+policy\s+"no client access to archive history"/);
  assert.match(sql, /using\s*\(false\)/);
  assert.match(sql, /with\s+check\s*\(false\)/);
  assert.match(sql, /revoke\s+all\s+on\s+public\.student_archive_history\s+from\s+authenticated/);
});

test('legacy schema removal preserves archive history before destructive ddl', () => {
  const sql = migration('20260911205000_remove_legacy_schema.sql');
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.student_archive_history/);
  assert.match(sql, /insert\s+into\s+public\.student_archive_history\s*\(student_id,\s*academy_id,\s*archived_at\)/);
  assert.match(sql, /archived_at history preservation mismatch/i);
  assert.match(sql, /archived_at contains rows without academy_id/i);
  assert.match(sql, /revoke\s+all\s+on\s+public\.student_archive_history\s+from\s+authenticated/);
  assert.match(sql, /financial_charges contains data/i);
  assert.match(sql, /installment_count contains non-default values/i);
  assert.match(sql, /drop\s+column\s+if\s+exists\s+archived_at/);
  assert.match(sql, /drop\s+table\s+if\s+exists\s+public\.financial_charges/);
  assert.match(sql, /drop\s+column\s+if\s+exists\s+installment_count/);
});
