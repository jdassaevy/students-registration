import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../../database/supabase-schema.sql', import.meta.url), 'utf8').toLowerCase();

test('reference schema documents canonical tenant and receipt semantics', () => {
  const receipts = schema.match(/create table if not exists public\.receipts \(([\s\S]*?)\n\);/)?.[1] || '';
  const students = schema.match(/create table if not exists public\.students \(([\s\S]*?)\n\);/)?.[1] || '';

  assert.match(receipts, /student_id\s+uuid\s+references\s+public\.students\(id\)\s+on\s+delete\s+set\s+null/);
  assert.doesNotMatch(receipts, /student_id[^\n]*on\s+delete\s+restrict/);
  assert.doesNotMatch(students, /archived_at/);
  assert.match(schema, /academy members manage students/);
  assert.match(schema, /is_academy_member\(academy_id\)/);
  assert.match(schema, /student_archive_history/);
  assert.doesNotMatch(schema, /financial_charges/);
  assert.doesNotMatch(schema, /installment_count/);
});
