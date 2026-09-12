import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
    'utf8'
);
const tenantHelper = fs.readFileSync(
    new URL('../../../supabase/functions/_shared/tenant.ts', import.meta.url),
    'utf8'
);

test('payment lifecycle authorizes through the shared active academy membership helper', () => {
    assert.match(source, /import\s*\{\s*requireAcademyAccess\s*\}\s*from\s*["']\.\.\/_shared\/tenant\.ts["']/);
    assert.match(source, /requireAcademyAccess\(admin,\s*user\.id,\s*student\.academy_id\)/);
    assert.doesNotMatch(source, /student\.user_id\s*!==\s*user\.id/);

    assert.match(tenantHelper, /from\(["']academy_members["']\)/);
    assert.match(tenantHelper, /eq\(["']academy_id["'],\s*academyId\)/);
    assert.match(tenantHelper, /eq\(["']user_id["'],\s*userId\)/);
    assert.match(tenantHelper, /eq\(["']is_active["'],\s*true\)/);
});

test('payment lifecycle loads identity from academies instead of academy_profiles', () => {
    assert.match(source, /from\(["']academies["']\)/);
    assert.match(source, /select\(["']name,display_name,responsible_name,support_phone["']\)/);
    assert.match(source, /eq\(["']id["'],\s*student\.academy_id\)/);
    assert.doesNotMatch(source, /from\(["']academy_profiles["']\)/);
});

test('receipt uses official academy name while messaging can use display name', () => {
    assert.match(source, /academyName:\s*academy\?*\.name|academyName:\s*academy\.name/);
    assert.match(source, /academy\?\.display_name\s*\|\|\s*academy\?\.name|academy\.display_name\s*\|\|\s*academy\.name/);
});

test('lifecycle fails closed when the student has no academy', () => {
    assert.match(source, /if\s*\(!student\.academy_id\)\s*return json\(\{\s*error:\s*["']Academy not resolved["']\s*\},\s*409\)/);
});
