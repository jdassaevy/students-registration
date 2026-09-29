import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260929_phase2d_bootstrap_edge_hardening.sql',
  import.meta.url
);
const functionUrl = new URL(
  '../../../supabase/functions/bootstrap-academy/index.ts',
  import.meta.url
);

test('phase 2d removes browser execute access from privileged bootstrap RPCs', () => {
  const sql = fs.readFileSync(migrationUrl, 'utf8').toLowerCase();

  assert.match(
    sql,
    /revoke execute on function public\.bootstrap_academy\(text\) from public, anon, authenticated/
  );
  assert.match(
    sql,
    /revoke execute on function public\.bootstrap_academy_service\(uuid, text\) from public, anon, authenticated/
  );
  assert.match(
    sql,
    /grant execute on function public\.bootstrap_academy_service\(uuid, text\) to service_role/
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.bootstrap_academy_service\(uuid, text\) to authenticated/
  );
});

test('bootstrap edge function derives user identity from a verified JWT', () => {
  const source = fs.readFileSync(functionUrl, 'utf8');

  assert.match(source, /authClient\.auth\.getUser\(\)/);
  assert.match(source, /p_user_id:\s*user\.id/);
  assert.doesNotMatch(source, /body\.user_id/);
  assert.match(source, /bootstrap_academy_service/);
});
