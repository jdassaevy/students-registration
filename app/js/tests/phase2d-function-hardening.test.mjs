import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../../../supabase/migrations/20260922_phase2d_function_acl_hardening.sql', import.meta.url),
  'utf8',
).toLowerCase();

const schema = fs.readFileSync(
  new URL('../../database/supabase-schema.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('Phase 2D moves membership helpers to security invoker', () => {
  for (const signature of [
    'public.is_academy_member(uuid)',
    'public.is_academy_owner(uuid)',
  ]) {
    const escaped = signature.replace(/[().]/g, '\\$&');
    assert.match(migration, new RegExp(`alter function ${escaped} security invoker`));
    assert.match(migration, new RegExp(`alter function ${escaped} set search_path = pg_catalog, public`));
  }

  assert.match(
    schema,
    /function public\.is_academy_member[\s\S]*?security invoker[\s\S]*?set search_path = pg_catalog, public/,
  );
  assert.match(
    schema,
    /function public\.is_academy_owner[\s\S]*?security invoker[\s\S]*?set search_path = pg_catalog, public/,
  );
});

test('privileged workflow RPCs stay narrowly exposed', () => {
  for (const signature of [
    'public.bootstrap_academy(text)',
    'public.delete_class_with_students(uuid)',
  ]) {
    const escaped = signature.replace(/[().]/g, '\\$&');
    assert.match(migration, new RegExp(`revoke execute on function ${escaped} from public, anon`));
    assert.match(migration, new RegExp(`grant execute on function ${escaped} to authenticated, service_role`));
    assert.doesNotMatch(migration, new RegExp(`alter function ${escaped} security invoker`));
  }

  assert.match(
    migration,
    /alter function public\.bootstrap_academy\(text\) set search_path = pg_catalog, public/,
  );
  assert.match(
    migration,
    /alter function public\.delete_class_with_students\(uuid\) set search_path = pg_catalog, public/,
  );
});

test('future postgres-owned public functions are deny-by-default for browser roles', () => {
  assert.match(
    migration,
    /alter default privileges for role postgres in schema public[\s\S]*revoke execute on functions from public, anon, authenticated/,
  );
  assert.match(
    schema,
    /alter default privileges for role postgres in schema public[\s\S]*revoke execute on functions from public, anon, authenticated/,
  );
});
