import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260901163000_academy_function_grants_hardening.sql',
  import.meta.url
);

test('academy security definer functions are not executable by anon', () => {
  assert.ok(fs.existsSync(migrationUrl), 'academy function grants hardening migration must exist');
  const sql = fs.readFileSync(migrationUrl, 'utf8').toLowerCase();

  for (const signature of [
    'public.bootstrap_academy(text)',
    'public.is_academy_member(uuid)',
    'public.is_academy_owner(uuid)'
  ]) {
    const escaped = signature.replace(/[().]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke execute on function ${escaped} from anon`));
  }

  assert.match(sql, /grant execute on function public\.bootstrap_academy\(text\) to authenticated/);
  assert.match(sql, /grant execute on function public\.is_academy_member\(uuid\) to authenticated/);
  assert.match(sql, /grant execute on function public\.is_academy_owner\(uuid\) to authenticated/);
});
