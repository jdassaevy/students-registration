import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relative) {
  return fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

const tenant = read('supabase/functions/_shared/tenant.ts');
const lifecycle = read('supabase/functions/payment-lifecycle/index.ts');
const receipt = read('supabase/functions/payment-receipt/index.ts');

test('tenant helper embeds academy identity in the active membership read', () => {
  assert.match(tenant, /export async function requireAcademyContext/);
  assert.match(
    tenant,
    /select\(['"]role,is_active,academy:academies!academy_members_academy_id_fkey\(name,display_name,responsible_name,support_phone\)['"]\)/
  );
  assert.match(tenant, /eq\(['"]academy_id['"],\s*academyId\)/);
  assert.match(tenant, /eq\(['"]user_id['"],\s*userId\)/);
  assert.match(tenant, /eq\(['"]is_active['"],\s*true\)/);
  assert.match(tenant, /if \(!member \|\| !member\.academy\) throw new Error\(['"]Forbidden['"]\)/);
});

test('normal payment lifecycle reuses academy identity from membership context', () => {
  const normalStart = lifecycle.indexOf('const { studentId, person, kind, installment } = input;');
  assert.ok(normalStart >= 0, 'normal payment flow must exist');
  const normalFlow = lifecycle.slice(normalStart);

  assert.match(
    normalFlow,
    /academyAccess\s*=\s*await requireAcademyContext\(admin, user\.id, student\.academy_id\)/
  );
  assert.match(normalFlow, /const academy = academyAccess\.academy/);
  assert.doesNotMatch(
    normalFlow,
    /admin\.from\(["']academies["']\)\.select\(["']name,display_name,responsible_name,support_phone["']\)/
  );
});

test('payment-receipt authorizes and loads academy identity through the shared context helper', () => {
  assert.match(
    receipt,
    /requireAcademyContext\(admin, user\.id, receipt\.academy_id\)/
  );
  assert.match(receipt, /const academy = academyAccess\.academy/);
  assert.doesNotMatch(receipt, /from\(["']academies["']\)/);
  assert.doesNotMatch(receipt, /from\(["']academy_members["']\)/);
  assert.match(receipt, /academyName:\s*academy\.name/);
});

test('repair payment lifecycle keeps simple academy access because it does not need academy identity', () => {
  const repairStart = lifecycle.indexOf('if (input.mode === "repair")');
  const normalStart = lifecycle.indexOf('const { studentId, person, kind, installment } = input;');
  assert.ok(repairStart >= 0 && normalStart > repairStart);
  const repairFlow = lifecycle.slice(repairStart, normalStart);
  assert.match(
    repairFlow,
    /requireAcademyAccess\(admin, user\.id, receipt\.academy_id\)/
  );
  assert.doesNotMatch(repairFlow, /requireAcademyContext/);
});
