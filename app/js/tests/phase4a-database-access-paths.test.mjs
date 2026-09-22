import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../../../supabase/migrations/20260922_phase4a_database_access_paths.sql', import.meta.url),
  'utf8',
).toLowerCase();
const schema = fs.readFileSync(
  new URL('../../database/supabase-schema.sql', import.meta.url),
  'utf8',
).toLowerCase();

const requiredIndexes = [
  'automation_messages_class_id_idx',
  'automation_messages_receipt_id_idx',
  'payment_events_class_id_idx',
  'receipts_class_id_idx',
  'receipts_academy_created_at_idx',
  'students_academy_created_at_idx',
  'classes_academy_created_at_idx',
  'payment_events_academy_paid_at_idx',
  'automation_messages_academy_created_at_idx',
];

test('Phase 4A migration is index-only and idempotent', () => {
  assert.doesNotMatch(migration, /\binsert\s+into\b/);
  assert.doesNotMatch(migration, /\bupdate\s+public\./);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/);
  assert.doesNotMatch(migration, /\bdrop\s+(?:index|table|column)\b/);
  assert.doesNotMatch(migration, /\balter\s+table\b/);
  assert.equal((migration.match(/create index if not exists/g) || []).length, requiredIndexes.length);
});

test('all reviewed access-path indexes exist in migration and canonical schema', () => {
  for (const name of requiredIndexes) {
    assert.match(migration, new RegExp(`create index if not exists ${name}\\b`));
    assert.match(schema, new RegExp(`create index if not exists ${name}\\b`));
  }
});

test('hot-path composite indexes preserve tenant-first column order', () => {
  assert.match(migration, /receipts_academy_created_at_idx[\s\S]*receipts\(academy_id, created_at desc\)/);
  assert.match(migration, /students_academy_created_at_idx[\s\S]*students\(academy_id, created_at desc\)/);
  assert.match(migration, /classes_academy_created_at_idx[\s\S]*classes\(academy_id, created_at asc\)/);
  assert.match(migration, /payment_events_academy_paid_at_idx[\s\S]*payment_events\(academy_id, paid_at asc\)/);
  assert.match(migration, /automation_messages_academy_created_at_idx[\s\S]*automation_messages\(academy_id, created_at desc\)/);
});
