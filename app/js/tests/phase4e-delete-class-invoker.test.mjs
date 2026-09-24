import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../../supabase/migrations/20260924_phase4e_delete_class_invoker.sql').toLowerCase();

test('delete_class_with_students drops unnecessary SECURITY DEFINER privilege', () => {
  assert.match(
    migration,
    /alter function public\.delete_class_with_students\(uuid\) security invoker/,
  );
});

test('delete_class_with_students stays callable only by authenticated clients', () => {
  assert.match(
    migration,
    /revoke execute on function public\.delete_class_with_students\(uuid\)[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.delete_class_with_students\(uuid\)[\s\S]*to authenticated/,
  );
});
