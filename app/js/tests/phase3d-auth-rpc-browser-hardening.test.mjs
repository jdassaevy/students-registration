import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const script = read('../core/script.js');
const index = read('../../index.html');
const themeBoot = read('../core/theme-boot.js');
const vercel = JSON.parse(read('../../../vercel.json'));
const migration = read('../../../supabase/migrations/20260922_phase3d_auth_rpc_browser_hardening.sql').toLowerCase();

test('new passwords use an 8 character client minimum without blocking legacy login', () => {
  assert.match(script, /const MIN_NEW_PASSWORD_LENGTH = 8/);
  assert.match(script, /mode === 'register' \|\| updatingPassword/);
  assert.match(script, /authPassword'\)\.minLength = creatingPassword \? MIN_NEW_PASSWORD_LENGTH : 1/);
  assert.match(script, /requiresStrongPassword && password\.length < MIN_NEW_PASSWORD_LENGTH/);
  assert.match(script, /pelo menos \$\{MIN_NEW_PASSWORD_LENGTH\} caracteres/);
  assert.doesNotMatch(index, /id="authPassword"[^>]*minlength="8"/);
  assert.match(index, /id="authPasswordConfirmation"[^>]*minlength="8"/);
});

test('password recovery redirect drops query and fragment state', () => {
  assert.ok(script.includes("redirectTo: `${location.origin}${location.pathname}`"));
  assert.doesNotMatch(script, /location\s*\.href\s*\.split\(['"]#['"]\)/);
  assert.doesNotMatch(script, /recoverySession/);
});

test('theme bootstrap is external so CSP can forbid inline scripts', () => {
  assert.match(index, /<script src="\.\/js\/core\/theme-boot\.js"><\/script>/);
  assert.doesNotMatch(index, /<script>\s*\(\(\) =>/);
  assert.match(themeBoot, /localStorage\.getItem\(['"]dassaevy-theme['"]\)/);
});

test('Vercel applies security headers to the whole app', () => {
  const rule = vercel.headers?.find(item => item.source === '/(.*)');
  assert.ok(rule, 'global Vercel header rule must exist');
  const headers = Object.fromEntries(rule.headers.map(item => [item.key.toLowerCase(), item.value]));
  const csp = headers['content-security-policy'] || '';

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.match(csp, /connect-src 'self' https:\/\/gswcruzlvkcoclbcrjvp\.supabase\.co wss:\/\/gswcruzlvkcoclbcrjvp\.supabase\.co/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['permissions-policy'], /camera=\(\)/);
  assert.equal(headers['strict-transport-security'], 'max-age=31536000');
});

test('Phase 3D removes direct authenticated EXECUTE from trigger helpers', () => {
  assert.match(
    migration,
    /revoke execute on function public\.touch_automation_settings_updated_at\(\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(migration, /to_regprocedure\('public\.set_financial_charge_updated_at\(\)'\)/);
  assert.match(
    migration,
    /revoke execute on function public\.set_financial_charge_updated_at\(\) from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /touch_automation_settings_updated_at\(\)[\s\S]*set search_path = pg_catalog, public/,
  );
});
